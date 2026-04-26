package com.topology.gis.heatmap;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.topology.gis.heatmap.dto.HeatmapCellDto;
import com.topology.gis.heatmap.dto.HeatmapResponse;
import com.topology.gis.shared.mapper.HeatmapMapper;
import com.topology.gis.tile.TileService;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

@Service
public class HeatmapService {

    private static final long CURRENT_GENERATION = 1L;
    private static final int CACHE_MAX_ENTRIES = 500;
    private static final long CACHE_TTL_MS = 5_000L;

    private final HeatmapMapper heatmapMapper;
    private final ObjectMapper objectMapper;
    private final Map<CacheKey, CacheEntry> cache = Collections.synchronizedMap(new LinkedHashMap<>(128, 0.75f, true) {
        @Override
        protected boolean removeEldestEntry(Map.Entry<CacheKey, CacheEntry> eldest) {
            return size() > CACHE_MAX_ENTRIES;
        }
    });

    public HeatmapService(HeatmapMapper heatmapMapper, ObjectMapper objectMapper) {
        this.heatmapMapper = heatmapMapper;
        this.objectMapper = objectMapper;
    }

    public HeatmapResponse getDeviceHeatmap(
            double west,
            double south,
            double east,
            double north,
            int columns,
            int rowCount,
            List<String> types,
            Map<String, String> propFilters) {

        String typesParam = TileService.toTypesParam(types);
        String propFilter = buildPropFilterJson(propFilters);
        CacheKey cacheKey = new CacheKey(west, south, east, north, columns, rowCount, typesParam, propFilter, CURRENT_GENERATION);
        CacheEntry cached = getCached(cacheKey);
        if (cached != null) {
            return cached.response();
        }

        List<HeatmapCellDto> cells = new ArrayList<>();
        long totalCount = 0L;
        long maxCount = 0L;
        for (var row : heatmapMapper.findDeviceHeatmapCells(west, south, east, north, columns, rowCount, typesParam, propFilter)) {
            long count = row.getCount() == null ? 0L : row.getCount();
            if (count <= 0L) {
                continue;
            }
            cells.add(new HeatmapCellDto(row.getX(), row.getY(), count));
            totalCount += count;
            maxCount = Math.max(maxCount, count);
        }

        HeatmapResponse response = new HeatmapResponse(
                west, south, east, north, columns, rowCount, maxCount, totalCount, cells, CURRENT_GENERATION);
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
            double west,
            double south,
            double east,
            double north,
            int columns,
            int rows,
            String typesParam,
            String propFilter,
            long generation
    ) {}

    private record CacheEntry(long expiresAtEpochMs, HeatmapResponse response) {}
}
