package com.topology.gis.shared.mapper;

import com.topology.gis.heatmap.dto.HeatmapCellRow;
import org.apache.ibatis.annotations.Param;

import java.util.List;

public interface HeatmapMapper {

    List<HeatmapCellRow> findDeviceHeatmapCells(
            @Param("west") double west,
            @Param("south") double south,
            @Param("east") double east,
            @Param("north") double north,
            @Param("columns") int columns,
            @Param("rows") int rows,
            @Param("types") String types,
            @Param("propFilter") String propFilter
    );
}
