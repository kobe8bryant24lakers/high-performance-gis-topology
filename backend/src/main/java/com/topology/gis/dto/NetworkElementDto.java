package com.topology.gis.dto;

import java.util.Map;

public record NetworkElementDto(
        String id,
        String type,
        String label,
        double lng,
        double lat,
        int version,
        String updatedAt,
        Map<String, Object> properties
) {}
