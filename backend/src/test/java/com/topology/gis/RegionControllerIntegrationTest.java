package com.topology.gis;

import com.topology.gis.admin.SeedService;
import com.topology.gis.region.dto.RegionSummaryResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;

import static org.assertj.core.api.Assertions.assertThat;

class RegionControllerIntegrationTest extends BaseIntegrationTest {

    @Autowired
    private SeedService seedService;

    @BeforeEach
    void setUp() {
        seedService.seed(1000, 600);
    }

    @Test
    void regionSummary_atCountryZoom_returnsVisibleCountries() {
        ResponseEntity<RegionSummaryResponse> resp = restTemplate.getForEntity(
                "/api/topology/regions/summary?z=2&west=-180&south=-85&east=180&north=85",
                RegionSummaryResponse.class);

        assertThat(resp.getStatusCode().is2xxSuccessful()).isTrue();
        assertThat(resp.getBody()).isNotNull();
        assertThat(resp.getBody().level()).isEqualTo("country");
        assertThat(resp.getBody().regions()).isNotEmpty();
    }

    @Test
    void regionSummary_typeCountsSumToTotal() {
        ResponseEntity<RegionSummaryResponse> resp = restTemplate.getForEntity(
                "/api/topology/regions/summary?z=2&west=-180&south=-85&east=180&north=85",
                RegionSummaryResponse.class);

        assertThat(resp.getStatusCode().is2xxSuccessful()).isTrue();
        RegionSummaryResponse body = resp.getBody();
        assertThat(body).isNotNull();
        assertThat(body.regions()).isNotEmpty();

        var region = body.regions().getFirst();
        long sum = region.elementTypes().values().stream().mapToLong(Long::longValue).sum();
        assertThat(sum).isEqualTo(region.totalCount());
    }

    @Test
    void regionSummary_typeFilterLimitsCounts() {
        ResponseEntity<RegionSummaryResponse> resp = restTemplate.getForEntity(
                "/api/topology/regions/summary?z=2&west=-180&south=-85&east=180&north=85&types=router",
                RegionSummaryResponse.class);

        assertThat(resp.getStatusCode().is2xxSuccessful()).isTrue();
        RegionSummaryResponse body = resp.getBody();
        assertThat(body).isNotNull();
        assertThat(body.regions()).isNotEmpty();
        body.regions().forEach(region -> {
            assertThat(region.elementTypes().get("router")).isEqualTo(region.totalCount());
            assertThat(region.elementTypes().get("firewall")).isZero();
            assertThat(region.elementTypes().get("switch")).isZero();
            assertThat(region.elementTypes().get("server")).isZero();
            assertThat(region.elementTypes().get("access-point")).isZero();
        });
    }

    @Test
    void regionSummary_virtualLinksAggregateBetweenRegions() {
        ResponseEntity<RegionSummaryResponse> resp = restTemplate.getForEntity(
                "/api/topology/regions/summary?z=2&west=-180&south=-85&east=180&north=85",
                RegionSummaryResponse.class);

        assertThat(resp.getStatusCode().is2xxSuccessful()).isTrue();
        RegionSummaryResponse body = resp.getBody();
        assertThat(body).isNotNull();
        assertThat(body.links()).allSatisfy(link -> {
            assertThat(link.sourceRegionId()).isNotEqualTo(link.targetRegionId());
            assertThat(link.count()).isPositive();
        });
    }

    @Test
    void regionSummary_atDeviceZoomReturnsEmptyResponse() {
        ResponseEntity<RegionSummaryResponse> resp = restTemplate.getForEntity(
                "/api/topology/regions/summary?z=10&west=-180&south=-85&east=180&north=85",
                RegionSummaryResponse.class);

        assertThat(resp.getStatusCode().is2xxSuccessful()).isTrue();
        RegionSummaryResponse body = resp.getBody();
        assertThat(body).isNotNull();
        assertThat(body.level()).isNull();
        assertThat(body.regions()).isEmpty();
        assertThat(body.links()).isEmpty();
    }
}
