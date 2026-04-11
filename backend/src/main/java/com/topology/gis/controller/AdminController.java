package com.topology.gis.controller;

import com.topology.gis.service.SeedService;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/topology/admin")
@Profile("!prod")
public class AdminController {

    private final SeedService seedService;

    public AdminController(SeedService seedService) {
        this.seedService = seedService;
    }

    @PostMapping("/seed")
    public ResponseEntity<Map<String, Object>> seed(
            @RequestParam(defaultValue = "5000") int elements,
            @RequestParam(defaultValue = "3000") int links) {
        seedService.seed(elements, links);
        return ResponseEntity.ok(Map.of(
                "status", "seeded",
                "elements", elements,
                "links", links
        ));
    }
}
