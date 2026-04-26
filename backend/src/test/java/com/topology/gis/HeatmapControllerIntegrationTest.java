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
}
