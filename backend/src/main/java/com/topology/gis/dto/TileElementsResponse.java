package com.topology.gis.dto;

import java.util.List;

public record TileElementsResponse(
        List<NetworkElementDto> elements,
        List<TopologyClusterDto> clusters,
        long generation,
        List<String> removedIds
) {}
