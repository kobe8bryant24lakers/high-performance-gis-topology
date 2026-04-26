package com.topology.gis.shared.mapper;

import com.topology.gis.region.dto.RegionInternalLinkRow;
import com.topology.gis.region.dto.RegionTypeCountRow;
import com.topology.gis.region.dto.RegionVirtualLinkRow;
import org.apache.ibatis.annotations.Param;

import java.util.List;

public interface RegionMapper {

    List<RegionTypeCountRow> findRegionTypeCounts(
            @Param("level") String level,
            @Param("regionColumn") String regionColumn,
            @Param("west") double west,
            @Param("south") double south,
            @Param("east") double east,
            @Param("north") double north,
            @Param("types") String types,
            @Param("propFilter") String propFilter
    );

    List<RegionInternalLinkRow> findInternalLinkCounts(
            @Param("level") String level,
            @Param("regionColumn") String regionColumn,
            @Param("west") double west,
            @Param("south") double south,
            @Param("east") double east,
            @Param("north") double north,
            @Param("types") String types,
            @Param("propFilter") String propFilter
    );

    List<RegionVirtualLinkRow> findVirtualLinks(
            @Param("level") String level,
            @Param("regionColumn") String regionColumn,
            @Param("west") double west,
            @Param("south") double south,
            @Param("east") double east,
            @Param("north") double north,
            @Param("types") String types,
            @Param("propFilter") String propFilter,
            @Param("limit") int limit
    );
}
