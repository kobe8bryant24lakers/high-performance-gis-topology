package com.topology.gis.dto;

import java.util.Map;

public record TopologyLinkDto(
        String id,
        String type,
        String sourceId,
        String targetId,
        boolean directed,
        Double weight,
        String status,
        int version,
        String updatedAt,
        Map<String, Object> properties
) {}
