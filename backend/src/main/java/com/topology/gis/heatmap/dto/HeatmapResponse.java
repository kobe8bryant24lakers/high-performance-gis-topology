package com.topology.gis.heatmap.dto;

import java.util.List;

public record HeatmapResponse(
        double west,
        double south,
        double east,
        double north,
        int columns,
        int rows,
        long maxCount,
        long totalCount,
        List<HeatmapCellDto> cells,
        long generation
) {}
