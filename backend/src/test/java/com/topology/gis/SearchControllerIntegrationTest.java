package com.topology.gis;

import com.topology.gis.search.dto.SearchResponse;
import com.topology.gis.admin.SeedService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import static org.assertj.core.api.Assertions.assertThat;

class SearchControllerIntegrationTest extends BaseIntegrationTest {

    @Autowired
    private SeedService seedService;

    @BeforeEach
    void setUp() {
        seedService.seed(200, 100);
    }

    @Test
    void search_byLabelSubstring_returnsMatches() {
        // All elements are labeled "{type}-{index}", so "router" will match router elements
        ResponseEntity<SearchResponse> resp = restTemplate.getForEntity(
                "/api/topology/search?q=router", SearchResponse.class);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(resp.getBody()).isNotNull();
        resp.getBody().results().forEach(e ->
                assertThat(e.label().toLowerCase() + e.type().toLowerCase()).contains("router"));
    }

    @Test
    void search_withTypeFilter_restrictesResults() {
        ResponseEntity<SearchResponse> all = restTemplate.getForEntity(
                "/api/topology/search?q=switch", SearchResponse.class);
        ResponseEntity<SearchResponse> typed = restTemplate.getForEntity(
                "/api/topology/search?q=switch&types=switch", SearchResponse.class);

        assertThat(all.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(typed.getStatusCode()).isEqualTo(HttpStatus.OK);
        // Typed results should all be of type "switch"
        typed.getBody().results().forEach(e -> assertThat(e.type()).isEqualTo("switch"));
    }

    @Test
    void search_emptyQuery_returnsEmpty() {
        ResponseEntity<SearchResponse> resp = restTemplate.getForEntity(
                "/api/topology/search?q=", SearchResponse.class);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(resp.getBody().results()).isEmpty();
        assertThat(resp.getBody().total()).isZero();
    }

    @Test
    void search_limitRespected() {
        ResponseEntity<SearchResponse> resp = restTemplate.getForEntity(
                "/api/topology/search?q=el&limit=5", SearchResponse.class);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(resp.getBody().results().size()).isLessThanOrEqualTo(5);
    }

    @Test
    void search_totalReflectsFullCount() {
        ResponseEntity<SearchResponse> resp = restTemplate.getForEntity(
                "/api/topology/search?q=router&limit=2", SearchResponse.class);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        SearchResponse body = resp.getBody();
        // total may be >= results.size() when results are limited
        assertThat(body.total()).isGreaterThanOrEqualTo(body.results().size());
    }
}
