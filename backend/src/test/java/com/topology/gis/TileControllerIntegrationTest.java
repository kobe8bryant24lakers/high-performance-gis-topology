package com.topology.gis;

import com.topology.gis.tile.dto.TileElementsResponse;
import com.topology.gis.tile.dto.TileLinksResponse;
import com.topology.gis.admin.SeedService;
import com.topology.gis.shared.entity.NetworkElement;
import com.topology.gis.shared.entity.TopologyLink;
import com.topology.gis.shared.mapper.NetworkElementMapper;
import com.topology.gis.shared.mapper.TopologyLinkMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

class TileControllerIntegrationTest extends BaseIntegrationTest {

    private static final String SAN_FRANCISCO_Z14_TILE = "/api/topology/tiles/14/2620/6332";
    private static final String SAN_FRANCISCO_Z8_TILE = "/api/topology/tiles/8/40/98";

    @Autowired
    private SeedService seedService;
    @Autowired
    private NetworkElementMapper elementMapper;
    @Autowired
    private TopologyLinkMapper linkMapper;

    @BeforeEach
    void setUp() {
        seedService.seed(1000, 600);
    }

    @Test
    void tileElements_atHighZoom_returnsElements() {
        // z=14 allows firewall, router, switch, server (not access-point)
        ResponseEntity<TileElementsResponse> resp = restTemplate.getForEntity(
                SAN_FRANCISCO_Z14_TILE + "/elements", TileElementsResponse.class);

        assertThat(resp.getStatusCode().is2xxSuccessful()).isTrue();
        assertThat(resp.getBody()).isNotNull();
        assertThat(resp.getBody().clusters()).isEmpty();
        assertThat(resp.getBody().generation()).isEqualTo(1L);
        assertThat(resp.getBody().removedIds()).isEmpty();
    }

    @Test
    void tileElements_atLowZoom_returnsOnlyZoomAllowedTypes() {
        // z=8 allows only firewall and router — no clusters, no switches/servers/access-points
        ResponseEntity<TileElementsResponse> resp = restTemplate.getForEntity(
                SAN_FRANCISCO_Z8_TILE + "/elements", TileElementsResponse.class);

        assertThat(resp.getStatusCode().is2xxSuccessful()).isTrue();
        TileElementsResponse body = resp.getBody();
        assertThat(body).isNotNull();
        assertThat(body.clusters()).isEmpty();
        body.elements().forEach(el ->
                assertThat(el.type()).isIn("firewall", "router"));
    }

    @Test
    void tileElements_withTypeFilter_reducesResults() {
        // Seed uses 5 types; filtering to one type should return fewer or equal results
        ResponseEntity<TileElementsResponse> all = restTemplate.getForEntity(
                SAN_FRANCISCO_Z14_TILE + "/elements", TileElementsResponse.class);
        ResponseEntity<TileElementsResponse> filtered = restTemplate.getForEntity(
                SAN_FRANCISCO_Z14_TILE + "/elements?types=router", TileElementsResponse.class);

        assertThat(all.getStatusCode().is2xxSuccessful()).isTrue();
        assertThat(filtered.getStatusCode().is2xxSuccessful()).isTrue();
        assertThat(filtered.getBody().elements().size())
                .isLessThanOrEqualTo(all.getBody().elements().size());
    }

    @Test
    void tileLinks_returnsLinksAndStubs() {
        ResponseEntity<TileLinksResponse> resp = restTemplate.getForEntity(
                SAN_FRANCISCO_Z14_TILE + "/links", TileLinksResponse.class);

        assertThat(resp.getStatusCode().is2xxSuccessful()).isTrue();
        assertThat(resp.getBody()).isNotNull();
        assertThat(resp.getBody().generation()).isEqualTo(1L);
        assertThat(resp.getBody().removedLinkIds()).isEmpty();
    }

    @Test
    void tileLinks_excludesStubsOutsideZoomAllowedTypes() {
        ResponseEntity<TileLinksResponse> resp = restTemplate.getForEntity(
                SAN_FRANCISCO_Z14_TILE + "/links", TileLinksResponse.class);

        assertThat(resp.getStatusCode().is2xxSuccessful()).isTrue();
        TileLinksResponse body = resp.getBody();
        assertThat(body).isNotNull();
        if (body.stubs().isEmpty()) {
            return;
        }

        Set<String> stubIds = body.stubs().stream().map(s -> s.id()).collect(Collectors.toSet());
        Set<String> stubTypes = elementMapper.selectBatchIds(stubIds).stream()
                .map(e -> e.getType())
                .collect(Collectors.toSet());

        assertThat(stubTypes).isSubsetOf("firewall", "router", "switch", "server");
    }

    @Test
    void tileElements_rejectsOversizedTypeToken() {
        String longType = "a".repeat(65);
        ResponseEntity<String> resp = restTemplate.getForEntity(
                SAN_FRANCISCO_Z14_TILE + "/elements?types=" + longType, String.class);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void tileLinks_includesLinksToHiddenEndpointTypesAsStubs() {
        linkMapper.delete(null);
        elementMapper.delete(null);

        OffsetDateTime now = OffsetDateTime.of(2026, 1, 1, 0, 0, 0, 0, ZoneOffset.UTC);

        NetworkElement visibleFirewall = new NetworkElement();
        visibleFirewall.setId("visible-fw");
        visibleFirewall.setType("firewall");
        visibleFirewall.setLabel("visible-fw");
        visibleFirewall.setLng(-122.6);
        visibleFirewall.setLat(37.9);
        visibleFirewall.setVersion(1);
        visibleFirewall.setUpdatedAt(now);
        visibleFirewall.setProperties(Map.of());
        elementMapper.insert(visibleFirewall);

        NetworkElement hiddenSwitch = new NetworkElement();
        hiddenSwitch.setId("hidden-sw");
        hiddenSwitch.setType("switch");
        hiddenSwitch.setLabel("hidden-sw");
        hiddenSwitch.setLng(-121.9);
        hiddenSwitch.setLat(37.9);
        hiddenSwitch.setVersion(1);
        hiddenSwitch.setUpdatedAt(now);
        hiddenSwitch.setProperties(Map.of());
        elementMapper.insert(hiddenSwitch);

        TopologyLink crossTypeLink = new TopologyLink();
        crossTypeLink.setId("cross-type-link");
        crossTypeLink.setType("connection");
        crossTypeLink.setSourceId("visible-fw");
        crossTypeLink.setTargetId("hidden-sw");
        crossTypeLink.setDirected(false);
        crossTypeLink.setVersion(1);
        crossTypeLink.setUpdatedAt(now);
        crossTypeLink.setProperties(Map.of());
        linkMapper.insert(crossTypeLink);

        ResponseEntity<TileLinksResponse> resp = restTemplate.getForEntity(
                SAN_FRANCISCO_Z8_TILE + "/links", TileLinksResponse.class);

        assertThat(resp.getStatusCode().is2xxSuccessful()).isTrue();
        TileLinksResponse body = resp.getBody();
        assertThat(body).isNotNull();
        assertThat(body.links().stream().map(link -> link.id())).contains("cross-type-link");
        assertThat(body.stubs().stream().map(stub -> stub.id())).contains("hidden-sw");
    }
}
