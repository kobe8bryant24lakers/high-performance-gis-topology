package com.topology.gis.region.dto;

import java.util.List;

public record RegionSummaryResponse(
        String level,
        List<RegionSummaryDto> regions,
        List<RegionVirtualLinkDto> links,
        long generation
) {}
