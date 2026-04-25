package com.topology.gis.region.dto;

import java.util.Map;

public record RegionSummaryDto(
        String id,
        String level,
        String name,
        String parentId,
        double centroidLng,
        double centroidLat,
        RegionBBoxDto bbox,
        long totalCount,
        Map<String, Long> elementTypes,
        long internalLinkCount
) {}
