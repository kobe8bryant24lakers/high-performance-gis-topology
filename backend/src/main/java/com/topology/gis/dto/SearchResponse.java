package com.topology.gis.dto;

import java.util.List;

public record SearchResponse(List<NetworkElementDto> results, long total) {}
