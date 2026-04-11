package com.topology.gis.dto;

import java.util.List;
import java.util.Map;

public record TopologyClusterDto(
        String id,
        double centroidLng,
        double centroidLat,
        int count,
        List<String> childIds,
        Map<String, Integer> elementTypes
) {}
