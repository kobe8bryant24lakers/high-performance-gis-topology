package com.topology.gis.controller;

import com.topology.gis.dto.TileElementsResponse;
import com.topology.gis.dto.TileLinksResponse;
import com.topology.gis.service.TileService;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.*;

import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/topology/tiles")
public class TileController {

    private final TileService tileService;

    public TileController(TileService tileService) {
        this.tileService = tileService;
    }

    @GetMapping("/{z}/{x}/{y}/elements")
    public TileElementsResponse getTileElements(
            @PathVariable int z,
            @PathVariable int x,
            @PathVariable int y,
            @RequestParam(value = "types", required = false, defaultValue = "") String typesParam,
            @RequestParam MultiValueMap<String, String> allParams) {

        return tileService.getTileElements(z, x, y, parseTypes(typesParam), parsePropFilters(allParams));
    }

    @GetMapping("/{z}/{x}/{y}/links")
    public TileLinksResponse getTileLinks(
            @PathVariable int z,
            @PathVariable int x,
            @PathVariable int y,
            @RequestParam(value = "types", required = false, defaultValue = "") String typesParam,
            @RequestParam MultiValueMap<String, String> allParams) {

        return tileService.getTileLinks(z, x, y, parseTypes(typesParam), parsePropFilters(allParams));
    }

    private List<String> parseTypes(String typesParam) {
        if (typesParam == null || typesParam.isBlank()) return List.of();
        return Arrays.asList(typesParam.split(","));
    }

    private Map<String, String> parsePropFilters(MultiValueMap<String, String> allParams) {
        return allParams.entrySet().stream()
                .filter(e -> e.getKey().startsWith("prop."))
                .collect(Collectors.toMap(
                        e -> e.getKey().substring(5),
                        e -> e.getValue().getFirst()
                ));
    }
}
