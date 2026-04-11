package com.topology.gis.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.topology.gis.dto.*;
import com.topology.gis.entity.NetworkElement;
import com.topology.gis.entity.TopologyLink;
import com.topology.gis.mapper.NetworkElementMapper;
import com.topology.gis.mapper.TopologyLinkMapper;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

@Service
public class TileService {

    private static final int CLUSTER_ZOOM_THRESHOLD = 12;
    private static final long CURRENT_GENERATION = 1L;

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

    /**
     * Converts a list of types to a PostgreSQL array literal string, e.g. "{router,switch}".
     * Returns null when the list is empty (triggers the IS NULL guard in the query).
     */
    private String toTypesParam(List<String> types) {
        if (types == null || types.isEmpty()) return null;
        return "{" + String.join(",", types) + "}";
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
                typesParam, propFilter);

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
                typesParam, propFilter);

        if (tileElements.isEmpty()) {
            return new TileLinksResponse(List.of(), List.of(), CURRENT_GENERATION, List.of());
        }

        Set<String> tileElementIds = tileElements.stream()
                .map(NetworkElement::getId)
                .collect(Collectors.toSet());

        // PostgreSQL array literal: {id1,id2,...}
        String idsParam = "{" + String.join(",", tileElementIds) + "}";
        List<TopologyLink> links = linkMapper.findLinksForElements(idsParam);

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
