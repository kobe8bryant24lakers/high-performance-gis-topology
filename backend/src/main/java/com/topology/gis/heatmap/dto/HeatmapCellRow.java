package com.topology.gis.heatmap.dto;

import lombok.Data;

@Data
public class HeatmapCellRow {
    private Integer x;
    private Integer y;
    private Long count;
}
