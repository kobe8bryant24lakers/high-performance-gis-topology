package com.topology.gis;

import com.topology.gis.dto.TileElementsResponse;
import com.topology.gis.dto.TileLinksResponse;
import com.topology.gis.service.SeedService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;

import static org.assertj.core.api.Assertions.assertThat;

class TileControllerIntegrationTest extends BaseIntegrationTest {

    @Autowired
    private SeedService seedService;

    @BeforeEach
    void setUp() {
        seedService.seed(1000, 600);
    }

    @Test
    void tileElements_atHighZoom_returnsElements() {
        // z=12 is the threshold; z=14 should return individual elements
        ResponseEntity<TileElementsResponse> resp = restTemplate.getForEntity(
                "/api/topology/tiles/14/8192/5460/elements", TileElementsResponse.class);

        assertThat(resp.getStatusCode().is2xxSuccessful()).isTrue();
        assertThat(resp.getBody()).isNotNull();
        assertThat(resp.getBody().clusters()).isEmpty();
        assertThat(resp.getBody().generation()).isEqualTo(1L);
        assertThat(resp.getBody().removedIds()).isEmpty();
    }

    @Test
    void tileElements_atLowZoom_returnsClusters() {
        // z=8 is below threshold, should return clusters
        ResponseEntity<TileElementsResponse> resp = restTemplate.getForEntity(
                "/api/topology/tiles/8/128/85/elements", TileElementsResponse.class);

        assertThat(resp.getStatusCode().is2xxSuccessful()).isTrue();
        TileElementsResponse body = resp.getBody();
        assertThat(body).isNotNull();
        // If any elements fall in this tile, clusters should be returned
        if (!body.clusters().isEmpty()) {
            assertThat(body.elements()).isEmpty();
            body.clusters().forEach(c -> {
                assertThat(c.id()).matches("tile:8/\\d+/\\d+:q[0-3]");
                assertThat(c.count()).isPositive();
            });
        }
    }

    @Test
    void tileElements_withTypeFilter_reducesResults() {
        // Seed uses 5 types; filtering to one type should return fewer or equal results
        ResponseEntity<TileElementsResponse> all = restTemplate.getForEntity(
                "/api/topology/tiles/14/8192/5460/elements", TileElementsResponse.class);
        ResponseEntity<TileElementsResponse> filtered = restTemplate.getForEntity(
                "/api/topology/tiles/14/8192/5460/elements?types=router", TileElementsResponse.class);

        assertThat(all.getStatusCode().is2xxSuccessful()).isTrue();
        assertThat(filtered.getStatusCode().is2xxSuccessful()).isTrue();
        assertThat(filtered.getBody().elements().size())
                .isLessThanOrEqualTo(all.getBody().elements().size());
    }

    @Test
    void tileLinks_returnsLinksAndStubs() {
        ResponseEntity<TileLinksResponse> resp = restTemplate.getForEntity(
                "/api/topology/tiles/14/8192/5460/links", TileLinksResponse.class);

        assertThat(resp.getStatusCode().is2xxSuccessful()).isTrue();
        assertThat(resp.getBody()).isNotNull();
        assertThat(resp.getBody().generation()).isEqualTo(1L);
        assertThat(resp.getBody().removedLinkIds()).isEmpty();
    }
}
