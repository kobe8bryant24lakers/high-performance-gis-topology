package com.topology.gis.tile;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.topology.gis.shared.entity.NetworkElement;
import com.topology.gis.shared.mapper.NetworkElementMapper;
import com.topology.gis.shared.mapper.TopologyLinkMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.lang.reflect.Proxy;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TileServiceZoomPolicyTest {

    // ── allowedTypesForZoom — interior values ──────────────────────────────────

    @Test
    void allowedTypesForZoom_zoom3_firewallOnly() {
        assertThat(TileService.allowedTypesForZoom(3))
                .containsExactlyInAnyOrder("firewall");
    }

    @Test
    void allowedTypesForZoom_zoom7_firewallOnly() {
        assertThat(TileService.allowedTypesForZoom(7))
                .containsExactlyInAnyOrder("firewall");
    }

    @Test
    void allowedTypesForZoom_zoom10_firewallRouter() {
        assertThat(TileService.allowedTypesForZoom(10))
                .containsExactlyInAnyOrder("firewall");
    }

    @Test
    void allowedTypesForZoom_zoom13_firewallRouterSwitch() {
        assertThat(TileService.allowedTypesForZoom(13))
                .containsExactlyInAnyOrder("firewall", "router", "switch");
    }

    @Test
    void allowedTypesForZoom_zoom15_firewallRouterSwitchServer() {
        assertThat(TileService.allowedTypesForZoom(15))
                .containsExactlyInAnyOrder("firewall", "router", "switch", "server");
    }

    // ── allowedTypesForZoom — boundary values (off-by-one guards) ─────────────

    @ParameterizedTest(name = "zoom={0} -> {1}")
    @CsvSource({
        "5,  'firewall'",
        "6,  'firewall'",
        "8,  'firewall'",
        "9,  'firewall'",
        "11, 'firewall'",
        "12, 'firewall,router,switch'",
        "13, 'firewall,router,switch'",
        "14, 'firewall,router,switch,server'",
        "15, 'firewall,router,switch,server'",
        "16, 'firewall,router,switch,server,access-point'"
    })
    void allowedTypesForZoom_boundaries(int z, String expectedCsv) {
        Set<String> expected = Set.of(expectedCsv.split(","));
        assertThat(TileService.allowedTypesForZoom(z))
                .containsExactlyInAnyOrderElementsOf(expected);
    }

    @Test
    void tileCaps_boundWorstCaseInteractivePayloads() {
        assertThat(TileService.TILE_ELEMENT_CAP).isGreaterThanOrEqualTo(50_000);
        assertThat(TileService.TILE_LINK_CAP).isLessThanOrEqualTo(5_000);
    }

    // ── effectiveTypes — intersection rule ─────────────────────────────────────

    @Test
    void effectiveTypes_nullClientFilter_returnsZoomAllowed() {
        List<String> result = TileService.effectiveTypes(10, null);
        assertThat(result).containsExactlyInAnyOrder("firewall");
    }

    @Test
    void effectiveTypes_emptyClientFilter_returnsZoomAllowed() {
        List<String> result = TileService.effectiveTypes(10, List.of());
        assertThat(result).containsExactlyInAnyOrder("firewall");
    }

    @Test
    void effectiveTypes_clientRequestsNotYetAllowedType_returnsEmpty() {
        // zoom=3 allows only firewall; client requests router → empty intersection
        List<String> result = TileService.effectiveTypes(3, List.of("router"));
        assertThat(result).isEmpty();
    }

    @Test
    void effectiveTypes_partialOverlap_returnsIntersection() {
        List<String> result = TileService.effectiveTypes(12, List.of("router", "server"));
        assertThat(result).containsExactlyInAnyOrder("router");
    }

    @Test
    void effectiveTypes_clientRequestsAllAllowed_returnsFull() {
        List<String> result = TileService.effectiveTypes(12, List.of("firewall", "router"));
        assertThat(result).containsExactlyInAnyOrder("firewall", "router");
    }

    @Test
    void effectiveTypes_isDeterministicAndDeduplicatedForCacheKeyStability() {
        List<String> result = TileService.effectiveTypes(15, List.of("router", "firewall", "router"));
        assertThat(result).containsExactly("firewall", "router");
    }

    @Test
    void firewallTiersForZoom_zoom5_coreOnly() {
        assertThat(TileService.firewallTiersForZoom(5)).containsExactly("core");
    }

    @Test
    void firewallTiersForZoom_zoom8_coreAndAggregation() {
        assertThat(TileService.firewallTiersForZoom(8)).containsExactly("aggregation", "core");
    }

    @Test
    void firewallTiersForZoom_zoom11_unrestricted() {
        assertThat(TileService.firewallTiersForZoom(11)).isEmpty();
    }

    @Test
    void getTileElements_zoom5InjectsCoreFirewallTierFilter() {
        AtomicInteger tileQueryCount = new AtomicInteger();
        java.util.concurrent.atomic.AtomicReference<Object[]> capturedArgs = new java.util.concurrent.atomic.AtomicReference<>();
        NetworkElementMapper elementMapper = stubElementMapper(tileQueryCount, List.of(), capturedArgs);
        TopologyLinkMapper linkMapper = stubLinkMapper();
        TileService service = new TileService(elementMapper, linkMapper, new ObjectMapper());

        service.getTileElements(5, 0, 0, List.of(), Map.of());

        assertThat(tileQueryCount.get()).isEqualTo(1);
        assertThat(capturedArgs.get()[6]).isEqualTo("{core}");
    }

    @Test
    void getTileElements_zoom5AccessTierUserFilterSkipsDbQuery() {
        AtomicInteger tileQueryCount = new AtomicInteger();
        NetworkElementMapper elementMapper = stubElementMapper(tileQueryCount, List.of());
        TopologyLinkMapper linkMapper = stubLinkMapper();
        TileService service = new TileService(elementMapper, linkMapper, new ObjectMapper());

        var response = service.getTileElements(5, 0, 0, List.of(), Map.of("networkTier", "access"));

        assertThat(response.elements()).isEmpty();
        assertThat(tileQueryCount.get()).isZero();
    }

    @Test
    void getTileElements_invalidTypeToken_rejectedBeforeZoomIntersection() {
        AtomicInteger tileQueryCount = new AtomicInteger();
        NetworkElementMapper elementMapper = stubElementMapper(tileQueryCount, List.of());
        TopologyLinkMapper linkMapper = stubLinkMapper();
        TileService service = new TileService(elementMapper, linkMapper, new ObjectMapper());

        assertThatThrownBy(() -> service.getTileElements(3, 0, 0, List.of("router", "bad token"), Map.of()))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST));

        assertThat(tileQueryCount.get()).isZero();
    }

    @Test
    void getTileElements_cacheHit_skipsSecondDbQuery() {
        NetworkElement e = new NetworkElement();
        e.setId("n1");
        e.setType("firewall");
        e.setLabel("fw-1");
        e.setLng(1.0);
        e.setLat(1.0);
        e.setVersion(1);
        AtomicInteger tileQueryCount = new AtomicInteger();
        NetworkElementMapper elementMapper = stubElementMapper(tileQueryCount, List.of(e));
        TopologyLinkMapper linkMapper = stubLinkMapper();
        TileService service = new TileService(elementMapper, linkMapper, new ObjectMapper());

        service.getTileElements(5, 0, 0, List.of(), Map.of());
        service.getTileElements(5, 0, 0, List.of(), Map.of());

        assertThat(tileQueryCount.get()).isEqualTo(1);
    }

    @Test
    void getTileLinks_emptyTileResult_cacheHit_skipsSecondDbQuery() {
        AtomicInteger tileQueryCount = new AtomicInteger();
        NetworkElementMapper elementMapper = stubElementMapper(tileQueryCount, List.of());
        TopologyLinkMapper linkMapper = stubLinkMapper();
        TileService service = new TileService(elementMapper, linkMapper, new ObjectMapper());

        service.getTileLinks(5, 0, 0, List.of(), Map.of());
        service.getTileLinks(5, 0, 0, List.of(), Map.of());

        assertThat(tileQueryCount.get()).isEqualTo(1);
    }

    private static NetworkElementMapper stubElementMapper(AtomicInteger tileQueryCount, List<NetworkElement> tileResponse) {
        return stubElementMapper(tileQueryCount, tileResponse, null);
    }

    private static NetworkElementMapper stubElementMapper(
            AtomicInteger tileQueryCount,
            List<NetworkElement> tileResponse,
            java.util.concurrent.atomic.AtomicReference<Object[]> capturedFindInTileArgs) {
        return (NetworkElementMapper) Proxy.newProxyInstance(
                NetworkElementMapper.class.getClassLoader(),
                new Class[]{NetworkElementMapper.class},
                (proxy, method, args) -> {
                    if ("findInTile".equals(method.getName())) {
                        tileQueryCount.incrementAndGet();
                        if (capturedFindInTileArgs != null) {
                            capturedFindInTileArgs.set(args);
                        }
                        return tileResponse;
                    }
                    if ("findIdsInTile".equals(method.getName())) {
                        tileQueryCount.incrementAndGet();
                        return List.of();
                    }
                    if ("findEndpointStubsByIds".equals(method.getName()) || "search".equals(method.getName())) {
                        return List.of();
                    }
                    if ("countSearch".equals(method.getName())) {
                        return 0L;
                    }
                    throw new UnsupportedOperationException("Unexpected mapper call: " + method.getName());
                });
    }

    private static TopologyLinkMapper stubLinkMapper() {
        return (TopologyLinkMapper) Proxy.newProxyInstance(
                TopologyLinkMapper.class.getClassLoader(),
                new Class[]{TopologyLinkMapper.class},
                (proxy, method, args) -> {
                    if ("findLinksForElements".equals(method.getName()) || "findNeighborLinks".equals(method.getName())) {
                        return List.of();
                    }
                    if ("findNeighborIds".equals(method.getName())) {
                        return List.of();
                    }
                    throw new UnsupportedOperationException("Unexpected mapper call: " + method.getName());
                });
    }
}
