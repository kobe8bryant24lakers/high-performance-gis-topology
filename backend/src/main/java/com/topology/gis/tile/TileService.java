package com.topology.gis.tile;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.topology.gis.shared.dto.EndpointStubDto;
import com.topology.gis.shared.dto.NetworkElementDto;
import com.topology.gis.shared.dto.TopologyClusterDto;
import com.topology.gis.shared.dto.TopologyLinkDto;
import com.topology.gis.shared.entity.NetworkElement;
import com.topology.gis.shared.entity.TopologyLink;
import com.topology.gis.shared.mapper.NetworkElementMapper;
import com.topology.gis.shared.mapper.TopologyLinkMapper;
import com.topology.gis.tile.dto.TileElementsResponse;
import com.topology.gis.tile.dto.TileLinksResponse;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.*;
import java.util.stream.Collectors;

@Service
public class TileService {

    public static final int CLUSTER_ZOOM_THRESHOLD = 12;
    private static final long CURRENT_GENERATION = 1L;
    /** Hard cap pushed into SQL LIMIT — prevents full-scan materialization at the DB layer. */
    static final int TILE_ELEMENT_CAP = 10_000;
    /** Hard cap on links returned per tile request. */
    static final int TILE_LINK_CAP = 50_000;

    private final NetworkElementMapper elementMapper;
    private final TopologyLinkMapper linkMapper;
    private final ClusteringService clusteringService;
    private final ObjectMapper objectMapper;

    public TileService(NetworkElementMapper elementMapper,
                       TopologyLinkMapper linkMapper,
                       ClusteringService clusteringService,
                       ObjectMapper objectMapper) {
        this.elementMapper = elementMapper;
        this.linkMapper = linkMapper;
        this.clusteringService = clusteringService;
        this.objectMapper = objectMapper;
    }

    /**
     * Tile bounding box in WGS84. Mirrors the TypeScript tileToBBox() in data-generator.ts.
     */
    public record TileBBox(double west, double south, double east, double north) {}

    public static TileBBox tileToBBox(int z, int x, int y) {
        double n = Math.pow(2, z);
        double west  = (x / n) * 360.0 - 180.0;
        double east  = ((x + 1) / n) * 360.0 - 180.0;
        double north = Math.toDegrees(Math.atan(Math.sinh(Math.PI * (1.0 - 2.0 * y / n))));
        double south = Math.toDegrees(Math.atan(Math.sinh(Math.PI * (1.0 - 2.0 * (y + 1) / n))));
        return new TileBBox(west, south, east, north);
    }

    /** Only allow alphanumeric, dash, and underscore in type tokens to prevent array-literal injection. */
    private static final java.util.regex.Pattern SAFE_TYPE_TOKEN = java.util.regex.Pattern.compile("^[a-zA-Z0-9_-]+$");

    /**
     * Converts a list of types to a PostgreSQL array literal string, e.g. "{router,switch}".
     * Returns null when the list is empty (triggers the IS NULL guard in the query).
     * Throws 400 if any token contains characters that could break the array literal.
     */
    public static String toTypesParam(List<String> types) {
        if (types == null || types.isEmpty()) return null;
        for (String token : types) {
            if (token == null || !SAFE_TYPE_TOKEN.matcher(token).matches()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Invalid type filter token: '" + token + "'. Only letters, digits, hyphens and underscores are allowed.");
            }
        }
        return "{" + String.join(",", types) + "}";
    }

    /**
     * Returns the set of element types visible at the given zoom level.
     * Each tier adds one layer of the network hierarchy to control density
     * while preserving connectivity at every zoom.
     */
    static Set<String> allowedTypesForZoom(int z) {
        if (z <= 5)  return Set.of("firewall");
        if (z <= 8)  return Set.of("firewall", "router");
        if (z <= 11) return Set.of("firewall", "router", "switch");
        if (z <= 14) return Set.of("firewall", "router", "switch", "server");
        return Set.of("firewall", "router", "switch", "server", "access-point");
    }

    /**
     * Computes the effective type list by intersecting the zoom-allowed set with the
     * client-requested types.
     *
     * Rules:
     *   - null or empty clientTypes → return all zoom-allowed types
     *   - non-empty clientTypes → return intersection (may be empty)
     */
    static List<String> effectiveTypes(int z, List<String> clientTypes) {
        Set<String> allowed = allowedTypesForZoom(z);
        if (clientTypes == null || clientTypes.isEmpty()) return new ArrayList<>(allowed);
        return clientTypes.stream().filter(allowed::contains).toList();
    }

    /**
     * Merges prop.* filter map into a JSON string for the JSONB @> operator.
     * Returns null when the map is empty.
     */
    private String buildPropFilterJson(Map<String, String> propFilters) {
        if (propFilters == null || propFilters.isEmpty()) return null;
        try {
            return objectMapper.writeValueAsString(propFilters);
        } catch (Exception e) {
            throw new IllegalArgumentException("Failed to serialize property filters", e);
        }
    }

    public TileElementsResponse getTileElements(
            int z, int x, int y,
            List<String> types,
            Map<String, String> propFilters) {

        TileBBox bbox = tileToBBox(z, x, y);
        String typesParam = toTypesParam(types);
        String propFilter = buildPropFilterJson(propFilters);

        List<NetworkElement> entities = elementMapper.findInTile(
                bbox.west(), bbox.south(), bbox.east(), bbox.north(),
                typesParam, propFilter, TILE_ELEMENT_CAP);

        if (z < CLUSTER_ZOOM_THRESHOLD && !entities.isEmpty()) {
            List<TopologyClusterDto> clusters = clusteringService.cluster(entities, z, x, y, bbox);
            return new TileElementsResponse(List.of(), clusters, CURRENT_GENERATION, List.of());
        }

        List<NetworkElementDto> dtos = entities.stream().map(this::toDto).toList();
        return new TileElementsResponse(dtos, List.of(), CURRENT_GENERATION, List.of());
    }

    public TileLinksResponse getTileLinks(
            int z, int x, int y,
            List<String> types,
            Map<String, String> propFilters) {

        TileBBox bbox = tileToBBox(z, x, y);
        String typesParam = toTypesParam(types);
        String propFilter = buildPropFilterJson(propFilters);

        List<NetworkElement> tileElements = elementMapper.findInTile(
                bbox.west(), bbox.south(), bbox.east(), bbox.north(),
                typesParam, propFilter, TILE_ELEMENT_CAP);

        if (tileElements.isEmpty()) {
            return new TileLinksResponse(List.of(), List.of(), CURRENT_GENERATION, List.of());
        }

        Set<String> tileElementIds = tileElements.stream()
                .map(NetworkElement::getId)
                .collect(Collectors.toSet());

        // PostgreSQL array literal: {id1,id2,...}
        String idsParam = "{" + String.join(",", tileElementIds) + "}";
        List<TopologyLink> links = linkMapper.findLinksForElements(idsParam, TILE_LINK_CAP);

        // Collect stub IDs: endpoints outside the tile
        Set<String> stubIds = new LinkedHashSet<>();
        for (TopologyLink link : links) {
            if (!tileElementIds.contains(link.getSourceId())) stubIds.add(link.getSourceId());
            if (!tileElementIds.contains(link.getTargetId())) stubIds.add(link.getTargetId());
        }

        List<EndpointStubDto> stubs = List.of();
        if (!stubIds.isEmpty()) {
            stubs = elementMapper.selectBatchIds(stubIds).stream()
                    .map(e -> new EndpointStubDto(e.getId(), e.getLng(), e.getLat()))
                    .toList();
        }

        List<TopologyLinkDto> linkDtos = links.stream().map(this::toLinkDto).toList();
        return new TileLinksResponse(linkDtos, stubs, CURRENT_GENERATION, List.of());
    }

    public NetworkElementDto toDto(NetworkElement e) {
        return new NetworkElementDto(
                e.getId(), e.getType(), e.getLabel(),
                e.getLng(), e.getLat(), e.getVersion(),
                e.getUpdatedAt() != null ? e.getUpdatedAt().toString() : null,
                e.getProperties() != null ? e.getProperties() : Map.of()
        );
    }

    public TopologyLinkDto toLinkDto(TopologyLink l) {
        return new TopologyLinkDto(
                l.getId(), l.getType(), l.getSourceId(), l.getTargetId(),
                Boolean.TRUE.equals(l.getDirected()), l.getWeight(), l.getStatus(),
                l.getVersion(),
                l.getUpdatedAt() != null ? l.getUpdatedAt().toString() : null,
                l.getProperties() != null ? l.getProperties() : Map.of()
        );
    }
}
