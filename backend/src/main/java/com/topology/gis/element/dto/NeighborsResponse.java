package com.topology.gis.element.dto;

import com.topology.gis.shared.dto.NetworkElementDto;
import com.topology.gis.shared.dto.TopologyLinkDto;

import java.util.List;

public record NeighborsResponse(
        List<NetworkElementDto> elements,
        List<TopologyLinkDto> links
) {}
