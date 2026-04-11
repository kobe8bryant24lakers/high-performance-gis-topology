package com.topology.gis.dto;

import java.util.List;

public record TileLinksResponse(
        List<TopologyLinkDto> links,
        List<EndpointStubDto> stubs,
        long generation,
        List<String> removedLinkIds
) {}
