package com.topology.gis.region;

import com.topology.gis.region.dto.RegionSummaryResponse;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.http.HttpStatus;
import org.springframework.util.MultiValueMap;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;

@RestController
@RequestMapping("/api/topology/regions")
@Validated
public class RegionController {

    private static final int MAX_TYPES = 16;
    private static final int MAX_TYPE_TOKEN_LENGTH = 64;
    private static final int MAX_PROP_FILTERS = 16;
    private static final int MAX_PROP_KEY_LENGTH = 64;
    private static final int MAX_PROP_VALUE_LENGTH = 256;
    private static final java.util.regex.Pattern SAFE_PROP_KEY =
            java.util.regex.Pattern.compile("^[a-zA-Z0-9_.-]+$");

    private final RegionService regionService;

    public RegionController(RegionService regionService) {
        this.regionService = regionService;
    }

    @GetMapping("/summary")
    public RegionSummaryResponse getSummary(
            @RequestParam @Min(0) @Max(22) int z,
            @RequestParam double west,
            @RequestParam double south,
            @RequestParam double east,
            @RequestParam double north,
            @RequestParam(value = "types", required = false, defaultValue = "") String typesParam,
            @RequestParam MultiValueMap<String, String> allParams) {

        validateBounds(west, south, east, north);
        return regionService.getSummary(z, west, south, east, north, parseTypes(typesParam), parsePropFilters(allParams));
    }

    private void validateBounds(double west, double south, double east, double north) {
        if (west < -180 || west > 180 || east < -180 || east > 180 || south < -90 || south > 90 || north < -90 || north > 90) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Region summary bounds are outside WGS84 limits.");
        }
        if (south >= north) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Region summary south must be less than north.");
        }
        if (west >= east) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Region summary west must be less than east.");
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
        for (String token : parsed) {
            if (token.length() > MAX_TYPE_TOKEN_LENGTH) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Type filter token too long. Max length: " + MAX_TYPE_TOKEN_LENGTH);
            }
        }
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
