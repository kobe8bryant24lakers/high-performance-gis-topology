package com.topology.gis.search;

import com.topology.gis.search.dto.SearchResponse;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
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
            @RequestParam(defaultValue = "20") @Min(1) @Max(200) int limit,
            @RequestParam(value = "types", required = false, defaultValue = "") String typesParam) {

        List<String> types = (typesParam == null || typesParam.isBlank())
                ? List.of()
                : Arrays.asList(typesParam.split(","));

        return searchService.search(query, limit, types);
    }
}
