package com.topology.gis.shared.dto;

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
