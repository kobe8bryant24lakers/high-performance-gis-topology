package com.topology.gis;

import com.topology.gis.admin.SeedService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class HeatmapControllerIntegrationTest extends BaseIntegrationTest {

    @Autowired
    private SeedService seedService;

    @BeforeEach
    void setUp() {
        seedService.seed(1000, 600);
    }

    @Test
    void heatmap_returnsRealDeviceGridBinsWithoutDeviceDetails() {
        ResponseEntity<Map> resp = restTemplate.getForEntity(
                "/api/topology/heatmap?west=-180&south=-90&east=180&north=90&cols=24&rows=12",
                Map.class);

        assertThat(resp.getStatusCode().is2xxSuccessful()).isTrue();
        Map body = resp.getBody();
        assertThat(body).isNotNull();
        assertThat(body.get("columns")).isEqualTo(24);
        assertThat(body.get("rows")).isEqualTo(12);
        assertThat(((Number) body.get("totalCount")).longValue()).isEqualTo(1000L);
        assertThat(((Number) body.get("maxCount")).longValue()).isPositive();

        List<Map<String, Object>> cells = (List<Map<String, Object>>) body.get("cells");
        assertThat(cells).isNotEmpty();
        assertThat(cells).hasSizeLessThanOrEqualTo(24 * 12);
        assertThat(cells).allSatisfy(cell -> {
            assertThat(((Number) cell.get("x")).intValue()).isBetween(0, 23);
            assertThat(((Number) cell.get("y")).intValue()).isBetween(0, 11);
            assertThat(((Number) cell.get("count")).longValue()).isPositive();
            assertThat(cell).doesNotContainKeys("id", "lng", "lat", "label", "properties");
        });
    }

    @Test
    void heatmap_rejectsOversizedGrids() {
        ResponseEntity<String> resp = restTemplate.getForEntity(
                "/api/topology/heatmap?west=-180&south=-90&east=180&north=90&cols=240&rows=120",
                String.class);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void heatmap_typeFilterReducesTotalCount() {
        ResponseEntity<Map> unfiltered = restTemplate.getForEntity(
                "/api/topology/heatmap?west=-180&south=-90&east=180&north=90&cols=24&rows=12",
                Map.class);
        ResponseEntity<Map> filtered = restTemplate.getForEntity(
                "/api/topology/heatmap?west=-180&south=-90&east=180&north=90&cols=24&rows=12&types=router",
                Map.class);

        assertThat(unfiltered.getStatusCode().is2xxSuccessful()).isTrue();
        assertThat(filtered.getStatusCode().is2xxSuccessful()).isTrue();
        long unfilteredTotal = ((Number) unfiltered.getBody().get("totalCount")).longValue();
        long filteredTotal = ((Number) filtered.getBody().get("totalCount")).longValue();
        assertThat(filteredTotal).isPositive();
        assertThat(filteredTotal).isLessThan(unfilteredTotal);
    }

    @Test
    void heatmap_propFilterEliminatesAllNonMatchingRows() {
        // Seed properties only set "index" (integer). A property filter on a key that no element
        // has must apply correctly — i.e. eliminate every row — proving the @> JSONB filter is wired up.
        ResponseEntity<Map> resp = restTemplate.getForEntity(
                "/api/topology/heatmap?west=-180&south=-90&east=180&north=90&cols=24&rows=12&prop.nonexistent=any",
                Map.class);

        assertThat(resp.getStatusCode().is2xxSuccessful()).isTrue();
        assertThat(((Number) resp.getBody().get("totalCount")).longValue()).isZero();
        assertThat((List<?>) resp.getBody().get("cells")).isEmpty();
    }

    @Test
    void heatmap_rejectsInvalidBounds() {
        ResponseEntity<String> swapped = restTemplate.getForEntity(
                "/api/topology/heatmap?west=10&south=10&east=-10&north=-10&cols=24&rows=12",
                String.class);
        ResponseEntity<String> outOfRange = restTemplate.getForEntity(
                "/api/topology/heatmap?west=-200&south=-90&east=180&north=90&cols=24&rows=12",
                String.class);

        assertThat(swapped.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(outOfRange.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void heatmap_emptyBinsAreOmittedFromCells() {
        // Bound the request to a tiny region near (0,0). The seed PRNG is unlikely to place all
        // 1000 elements there, so most of the cols×rows grid will be empty and filtered out.
        ResponseEntity<Map> resp = restTemplate.getForEntity(
                "/api/topology/heatmap?west=-1&south=-1&east=1&north=1&cols=24&rows=12",
                Map.class);

        assertThat(resp.getStatusCode().is2xxSuccessful()).isTrue();
        List<Map<String, Object>> cells = (List<Map<String, Object>>) resp.getBody().get("cells");
        assertThat(cells).allSatisfy(cell ->
                assertThat(((Number) cell.get("count")).longValue()).isPositive());
        assertThat(cells.size()).isLessThan(24 * 12);
    }
}
