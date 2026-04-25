package com.topology.gis.region.dto;

public record RegionVirtualLinkDto(
        String id,
        String sourceRegionId,
        String targetRegionId,
        long count
) {}
