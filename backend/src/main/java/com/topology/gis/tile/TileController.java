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
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;

@RestController
@RequestMapping("/api/topology/tiles")
@Validated
public class TileController {

    private static final int MAX_TYPES = 16;
    private static final int MAX_PROP_FILTERS = 16;
    private static final int MAX_PROP_KEY_LENGTH = 64;
    private static final int MAX_PROP_VALUE_LENGTH = 256;
    private static final java.util.regex.Pattern SAFE_PROP_KEY =
            java.util.regex.Pattern.compile("^[a-zA-Z0-9_.-]+$");

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
        List<String> parsed = Arrays.stream(typesParam.split(","))
                .map(String::trim)
                .filter(token -> !token.isEmpty())
                .map(token -> token.toLowerCase(Locale.ROOT))
                .distinct()
                .toList();
        if (parsed.size() > MAX_TYPES) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Too many type filters. Max allowed: " + MAX_TYPES);
        }
        return parsed;
    }

    private Map<String, String> parsePropFilters(MultiValueMap<String, String> allParams) {
        Map<String, String> result = new TreeMap<>();
        for (Map.Entry<String, List<String>> entry : allParams.entrySet()) {
            String rawKey = entry.getKey();
            if (!rawKey.startsWith("prop.")) {
                continue;
            }

            String key = rawKey.substring(5).trim();
            if (key.isEmpty()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Property filter key cannot be empty.");
            }
            if (key.length() > MAX_PROP_KEY_LENGTH) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Property filter key too long: " + key);
            }
            if (!SAFE_PROP_KEY.matcher(key).matches()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Invalid property filter key: " + key);
            }

            List<String> values = entry.getValue();
            if (values == null || values.size() != 1 || values.getFirst() == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Property filter '" + key + "' must have exactly one non-null value.");
            }

            String value = values.getFirst();
            if (value.length() > MAX_PROP_VALUE_LENGTH) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Property filter value too long for key: " + key);
            }

            result.put(key, value);
            if (result.size() > MAX_PROP_FILTERS) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Too many property filters. Max allowed: " + MAX_PROP_FILTERS);
            }
        }
        return result;
    }
}
