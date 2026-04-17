package com.topology.gis.tile;

import com.topology.gis.tile.dto.TileElementsResponse;
import com.topology.gis.tile.dto.TileLinksResponse;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.http.HttpStatus;
import org.springframework.util.MultiValueMap;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/topology/tiles")
@Validated
public class TileController {

    private final TileService tileService;

    public TileController(TileService tileService) {
        this.tileService = tileService;
    }

    @GetMapping("/{z}/{x}/{y}/elements")
    public TileElementsResponse getTileElements(
            @PathVariable @Min(0) @Max(22) int z,
            @PathVariable @Min(0) int x,
            @PathVariable @Min(0) int y,
            @RequestParam(value = "types", required = false, defaultValue = "") String typesParam,
            @RequestParam MultiValueMap<String, String> allParams) {

        validateTileCoordinates(z, x, y);
        return tileService.getTileElements(z, x, y, parseTypes(typesParam), parsePropFilters(allParams));
    }

    @GetMapping("/{z}/{x}/{y}/links")
    public TileLinksResponse getTileLinks(
            @PathVariable @Min(0) @Max(22) int z,
            @PathVariable @Min(0) int x,
            @PathVariable @Min(0) int y,
            @RequestParam(value = "types", required = false, defaultValue = "") String typesParam,
            @RequestParam MultiValueMap<String, String> allParams) {

        validateTileCoordinates(z, x, y);
        return tileService.getTileLinks(z, x, y, parseTypes(typesParam), parsePropFilters(allParams));
    }

    /** Tile coordinates must satisfy 0 <= x,y < 2^z. */
    private void validateTileCoordinates(int z, int x, int y) {
        int maxTile = 1 << z;  // 2^z
        if (x >= maxTile || y >= maxTile) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    String.format("Tile coordinates out of range for z=%d: x=%d y=%d (max %d)", z, x, y, maxTile - 1));
        }
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
