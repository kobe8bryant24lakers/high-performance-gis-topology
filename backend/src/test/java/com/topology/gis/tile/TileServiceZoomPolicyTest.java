package com.topology.gis.tile;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class TileServiceZoomPolicyTest {

    // ── allowedTypesForZoom — interior values ──────────────────────────────────

    @Test
    void allowedTypesForZoom_zoom3_firewallOnly() {
        assertThat(TileService.allowedTypesForZoom(3))
                .containsExactlyInAnyOrder("firewall");
    }

    @Test
    void allowedTypesForZoom_zoom7_firewallAndRouter() {
        assertThat(TileService.allowedTypesForZoom(7))
                .containsExactlyInAnyOrder("firewall", "router");
    }

    @Test
    void allowedTypesForZoom_zoom10_firewallRouterSwitch() {
        assertThat(TileService.allowedTypesForZoom(10))
                .containsExactlyInAnyOrder("firewall", "router", "switch");
    }

    @Test
    void allowedTypesForZoom_zoom13_firewallRouterSwitchServer() {
        assertThat(TileService.allowedTypesForZoom(13))
                .containsExactlyInAnyOrder("firewall", "router", "switch", "server");
    }

    @Test
    void allowedTypesForZoom_zoom15_allFiveTypes() {
        assertThat(TileService.allowedTypesForZoom(15))
                .containsExactlyInAnyOrder("firewall", "router", "switch", "server", "access-point");
    }

    // ── allowedTypesForZoom — boundary values (off-by-one guards) ─────────────

    @ParameterizedTest(name = "zoom={0} -> {1}")
    @CsvSource({
        "5,  'firewall'",
        "6,  'firewall,router'",
        "8,  'firewall,router'",
        "9,  'firewall,router,switch'",
        "11, 'firewall,router,switch'",
        "12, 'firewall,router,switch,server'",
        "14, 'firewall,router,switch,server'",
        "15, 'firewall,router,switch,server,access-point'"
    })
    void allowedTypesForZoom_boundaries(int z, String expectedCsv) {
        Set<String> expected = Set.of(expectedCsv.split(","));
        assertThat(TileService.allowedTypesForZoom(z))
                .containsExactlyInAnyOrderElementsOf(expected);
    }

    // ── effectiveTypes — intersection rule ─────────────────────────────────────

    @Test
    void effectiveTypes_nullClientFilter_returnsZoomAllowed() {
        // zoom=10 allows firewall, router, switch
        List<String> result = TileService.effectiveTypes(10, null);
        assertThat(result).containsExactlyInAnyOrder("firewall", "router", "switch");
    }

    @Test
    void effectiveTypes_emptyClientFilter_returnsZoomAllowed() {
        List<String> result = TileService.effectiveTypes(10, List.of());
        assertThat(result).containsExactlyInAnyOrder("firewall", "router", "switch");
    }

    @Test
    void effectiveTypes_clientRequestsNotYetAllowedType_returnsEmpty() {
        // zoom=3 allows only firewall; client requests router → empty intersection
        List<String> result = TileService.effectiveTypes(3, List.of("router"));
        assertThat(result).isEmpty();
    }

    @Test
    void effectiveTypes_partialOverlap_returnsIntersection() {
        // zoom=10 allows firewall,router,switch; client requests router,server → only router
        List<String> result = TileService.effectiveTypes(10, List.of("router", "server"));
        assertThat(result).containsExactlyInAnyOrder("router");
    }

    @Test
    void effectiveTypes_clientRequestsAllAllowed_returnsFull() {
        // zoom=7 allows firewall,router; client requests same two
        List<String> result = TileService.effectiveTypes(7, List.of("firewall", "router"));
        assertThat(result).containsExactlyInAnyOrder("firewall", "router");
    }
}
