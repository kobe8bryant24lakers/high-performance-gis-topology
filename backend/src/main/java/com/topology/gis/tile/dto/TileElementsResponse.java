package com.topology.gis.tile.dto;

import com.topology.gis.shared.dto.NetworkElementDto;
import com.topology.gis.shared.dto.TopologyClusterDto;

import java.util.List;

public record TileElementsResponse(
        List<NetworkElementDto> elements,
        List<TopologyClusterDto> clusters,
        long generation,
        List<String> removedIds
) {}
