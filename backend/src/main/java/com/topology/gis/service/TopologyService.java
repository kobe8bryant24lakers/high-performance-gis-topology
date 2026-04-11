package com.topology.gis.service;

import com.topology.gis.dto.NeighborsResponse;
import com.topology.gis.dto.NetworkElementDto;
import com.topology.gis.entity.NetworkElement;
import com.topology.gis.entity.TopologyLink;
import com.topology.gis.mapper.NetworkElementMapper;
import com.topology.gis.mapper.TopologyLinkMapper;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@Service
public class TopologyService {

    private final NetworkElementMapper elementMapper;
    private final TopologyLinkMapper linkMapper;
    private final TileService tileService;

    public TopologyService(NetworkElementMapper elementMapper,
                           TopologyLinkMapper linkMapper,
                           TileService tileService) {
        this.elementMapper = elementMapper;
        this.linkMapper = linkMapper;
        this.tileService = tileService;
    }

    public NetworkElementDto getElementById(String id) {
        NetworkElement element = elementMapper.selectById(id);
        if (element == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Element not found: " + id);
        }
        return tileService.toDto(element);
    }

    public NeighborsResponse getNeighbors(String id, int depth) {
        if (elementMapper.selectById(id) == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Element not found: " + id);
        }
        int clampedDepth = Math.min(Math.max(depth, 1), 3);

        List<String> neighborIds = linkMapper.findNeighborIds(id, clampedDepth);
        List<NetworkElement> neighborElements = neighborIds.isEmpty()
                ? List.of()
                : elementMapper.selectBatchIds(neighborIds);
        List<TopologyLink> links = linkMapper.findNeighborLinks(id, clampedDepth);

        return new NeighborsResponse(
                neighborElements.stream().map(tileService::toDto).toList(),
                links.stream().map(tileService::toLinkDto).toList()
        );
    }
}
