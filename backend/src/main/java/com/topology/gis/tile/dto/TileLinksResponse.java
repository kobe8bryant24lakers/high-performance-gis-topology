package com.topology.gis.tile.dto;

import com.topology.gis.shared.dto.EndpointStubDto;
import com.topology.gis.shared.dto.TopologyLinkDto;

import java.util.List;

public record TileLinksResponse(
        List<TopologyLinkDto> links,
        List<EndpointStubDto> stubs,
        long generation,
        List<String> removedLinkIds
) {}
