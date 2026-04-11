package com.topology.gis.dto;

import java.util.List;

public record NeighborsResponse(
        List<NetworkElementDto> elements,
        List<TopologyLinkDto> links
) {}
