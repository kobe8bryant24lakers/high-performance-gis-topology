package com.topology.gis.admin;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * Admin-only seeding endpoint. Active only on the "local" profile (explicit opt-in).
 * Requires a matching X-Admin-Token header to prevent accidental or malicious reseeding.
 * Input size is bounded to prevent abusive writes.
 */
@RestController
@RequestMapping("/api/topology/admin")
@Profile("local")
@Validated
public class AdminController {

    private final SeedService seedService;
    private final String adminToken;

    public AdminController(SeedService seedService,
                           @Value("${admin.seed.token}") String adminToken) {
        this.seedService = seedService;
        this.adminToken = adminToken;
    }

    @PostMapping("/seed")
    public ResponseEntity<Map<String, Object>> seed(
            @RequestHeader("X-Admin-Token") String token,
            @RequestParam(defaultValue = "5000") @Min(1) @Max(100_000) int elements,
            @RequestParam(defaultValue = "3000") @Min(0) @Max(500_000) int links) {

        if (!adminToken.equals(token)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        seedService.seed(elements, links);
        return ResponseEntity.ok(Map.of(
                "status", "seeded",
                "elements", elements,
                "links", links
        ));
    }
}
