package com.topology.gis.search.dto;

import com.topology.gis.shared.dto.NetworkElementDto;

import java.util.List;

public record SearchResponse(List<NetworkElementDto> results, long total) {}
