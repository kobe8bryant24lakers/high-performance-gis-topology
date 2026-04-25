package com.topology.gis.region;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.topology.gis.region.dto.RegionBBoxDto;
import com.topology.gis.region.dto.RegionSummaryDto;
import com.topology.gis.region.dto.RegionSummaryResponse;
import com.topology.gis.region.dto.RegionVirtualLinkDto;
import com.topology.gis.shared.mapper.RegionMapper;
import com.topology.gis.tile.TileService;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

@Service
public class RegionService {

    private static final long CURRENT_GENERATION = 1L;
    private static final int VIRTUAL_LINK_LIMIT = 2_000;
    private static final int CACHE_MAX_ENTRIES = 500;
    private static final long CACHE_TTL_MS = 5_000L;
    private static final List<String> DEVICE_TYPES = List.of(
            "firewall", "router", "switch", "server", "access-point");

    private final RegionMapper regionMapper;
    private final ObjectMapper objectMapper;
    private final Map<CacheKey, CacheEntry> cache = Collections.synchronizedMap(new LinkedHashMap<>(128, 0.75f, true) {
        @Override
        protected boolean removeEldestEntry(Map.Entry<CacheKey, CacheEntry> eldest) {
            return size() > CACHE_MAX_ENTRIES;
        }
    });

    public RegionService(RegionMapper regionMapper, ObjectMapper objectMapper) {
        this.regionMapper = regionMapper;
        this.objectMapper = objectMapper;
    }

    public static String levelForZoom(int z) {
        if (z <= 3) return "country";
        if (z <= 6) return "province";
        if (z <= 9) return "city";
        return null;
    }

    static String regionColumnForLevel(String level) {
        return switch (level) {
            case "country" -> "country_region_id";
            case "province" -> "province_region_id";
            case "city" -> "city_region_id";
            default -> throw new IllegalArgumentException("Unsupported region level: " + level);
        };
    }

    public RegionSummaryResponse getSummary(
            int z,
            double west,
            double south,
            double east,
            double north,
            List<String> types,
            Map<String, String> propFilters) {

        TileService.toTypesParam(types);
        String level = levelForZoom(z);
        if (level == null) {
            return new RegionSummaryResponse(null, List.of(), List.of(), CURRENT_GENERATION);
        }

        String typesParam = TileService.toTypesParam(types == null || types.isEmpty() ? List.of() : types);
        String propFilter = buildPropFilterJson(propFilters);
        CacheKey cacheKey = new CacheKey(level, west, south, east, north, typesParam, propFilter, CURRENT_GENERATION);
        CacheEntry cached = getCached(cacheKey);
        if (cached != null) {
            return cached.response();
        }

        String regionColumn = regionColumnForLevel(level);
        Map<String, RegionBuilder> builders = new LinkedHashMap<>();
        for (var row : regionMapper.findRegionTypeCounts(level, regionColumn, west, south, east, north, typesParam, propFilter)) {
            RegionBuilder builder = builders.computeIfAbsent(row.getRegionId(), ignored -> new RegionBuilder(
                    row.getRegionId(),
                    row.getLevel(),
                    row.getName(),
                    row.getParentId(),
                    row.getCentroidLng(),
                    row.getCentroidLat(),
                    new RegionBBoxDto(row.getBboxWest(), row.getBboxSouth(), row.getBboxEast(), row.getBboxNorth())
            ));
            builder.putTypeCount(row.getType(), row.getCount() == null ? 0L : row.getCount());
        }

        for (var row : regionMapper.findInternalLinkCounts(level, regionColumn, west, south, east, north, typesParam, propFilter)) {
            RegionBuilder builder = builders.get(row.getRegionId());
            if (builder != null) {
                builder.internalLinkCount = row.getCount() == null ? 0L : row.getCount();
            }
        }

        List<RegionVirtualLinkDto> links = regionMapper
                .findVirtualLinks(level, regionColumn, west, south, east, north, typesParam, propFilter, VIRTUAL_LINK_LIMIT)
                .stream()
                .filter(row -> builders.containsKey(row.getSourceRegionId()) && builders.containsKey(row.getTargetRegionId()))
                .map(row -> new RegionVirtualLinkDto(
                        row.getSourceRegionId() + "--" + row.getTargetRegionId(),
                        row.getSourceRegionId(),
                        row.getTargetRegionId(),
                        row.getCount() == null ? 0L : row.getCount()
                ))
                .toList();

        List<RegionSummaryDto> regions = builders.values().stream()
                .map(RegionBuilder::build)
                .toList();
        RegionSummaryResponse response = new RegionSummaryResponse(level, regions, links, CURRENT_GENERATION);
        cache.put(cacheKey, new CacheEntry(System.currentTimeMillis() + CACHE_TTL_MS, response));
        return response;
    }

    private CacheEntry getCached(CacheKey key) {
        CacheEntry entry = cache.get(key);
        if (entry == null) return null;
        if (System.currentTimeMillis() > entry.expiresAtEpochMs()) {
            cache.remove(key);
            return null;
        }
        return entry;
    }

    private String buildPropFilterJson(Map<String, String> propFilters) {
        if (propFilters == null || propFilters.isEmpty()) return null;
        try {
            return objectMapper.writeValueAsString(new TreeMap<>(propFilters));
        } catch (Exception e) {
            throw new IllegalArgumentException("Failed to serialize property filters", e);
        }
    }

    private record CacheKey(
            String level,
            double west,
            double south,
            double east,
            double north,
            String typesParam,
            String propFilter,
            long generation
    ) {}

    private record CacheEntry(long expiresAtEpochMs, RegionSummaryResponse response) {}

    private static class RegionBuilder {
        private final String id;
        private final String level;
        private final String name;
        private final String parentId;
        private final double centroidLng;
        private final double centroidLat;
        private final RegionBBoxDto bbox;
        private final Map<String, Long> typeCounts = new LinkedHashMap<>();
        private long internalLinkCount = 0L;

        private RegionBuilder(
                String id,
                String level,
                String name,
                String parentId,
                double centroidLng,
                double centroidLat,
                RegionBBoxDto bbox) {
            this.id = id;
            this.level = level;
            this.name = name;
            this.parentId = parentId;
            this.centroidLng = centroidLng;
            this.centroidLat = centroidLat;
            this.bbox = bbox;
            DEVICE_TYPES.forEach(type -> typeCounts.put(type, 0L));
        }

        private void putTypeCount(String type, long count) {
            if (type != null && typeCounts.containsKey(type)) {
                typeCounts.put(type, count);
            }
        }

        private RegionSummaryDto build() {
            Map<String, Long> stableCounts = new LinkedHashMap<>(typeCounts);
            long totalCount = new ArrayList<>(stableCounts.values()).stream().mapToLong(Long::longValue).sum();
            return new RegionSummaryDto(
                    id,
                    level,
                    name,
                    parentId,
                    centroidLng,
                    centroidLat,
                    bbox,
                    totalCount,
                    stableCounts,
                    internalLinkCount
            );
        }
    }
}
