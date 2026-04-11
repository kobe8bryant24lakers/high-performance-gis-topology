package com.topology.gis.element;

import com.topology.gis.element.dto.NeighborsResponse;
import com.topology.gis.shared.dto.NetworkElementDto;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/topology/elements")
@Validated
public class ElementController {

    private final TopologyService topologyService;

    public ElementController(TopologyService topologyService) {
        this.topologyService = topologyService;
    }

    @GetMapping("/{id}")
    public NetworkElementDto getElement(@PathVariable String id) {
        return topologyService.getElementById(id);
    }

    @GetMapping("/{id}/neighbors")
    public NeighborsResponse getNeighbors(
            @PathVariable String id,
            @RequestParam(defaultValue = "1") @Min(1) @Max(3) int depth) {
        return topologyService.getNeighbors(id, depth);
    }
}
