package com.topology.gis.controller;

import com.topology.gis.dto.SearchResponse;
import com.topology.gis.service.SearchService;
import jakarta.validation.constraints.Max;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.Arrays;
import java.util.List;

@RestController
@RequestMapping("/api/topology")
@Validated
public class SearchController {

    private final SearchService searchService;

    public SearchController(SearchService searchService) {
        this.searchService = searchService;
    }

    @GetMapping("/search")
    public SearchResponse search(
            @RequestParam(value = "q", defaultValue = "") String query,
            @RequestParam(defaultValue = "20") @Max(200) int limit,
            @RequestParam(value = "types", required = false, defaultValue = "") String typesParam) {

        List<String> types = (typesParam == null || typesParam.isBlank())
                ? List.of()
                : Arrays.asList(typesParam.split(","));

        return searchService.search(query, limit, types);
    }
}
