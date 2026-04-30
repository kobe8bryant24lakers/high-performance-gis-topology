package com.topology.gis.admin;

import com.topology.gis.shared.entity.NetworkElement;
import com.topology.gis.shared.entity.TopologyLink;
import com.topology.gis.shared.mapper.NetworkElementMapper;
import com.topology.gis.shared.mapper.TopologyLinkMapper;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Proxy;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class SeedServiceTest {

    private static final double CALIFORNIA_WEST = -124.482003;
    private static final double CALIFORNIA_EAST = -114.131211;
    private static final double CALIFORNIA_SOUTH = 32.528832;
    private static final double CALIFORNIA_NORTH = 42.009518;

    @Test
    void seed_generatesElementCoordinatesInsideCaliforniaBounds() {
        List<NetworkElement> insertedElements = new ArrayList<>();
        List<TopologyLink> insertedLinks = new ArrayList<>();
        int[] assignRegionCalls = {0};
        int[] linkDeleteCalls = {0};

        NetworkElementMapper elementMapper = (NetworkElementMapper) Proxy.newProxyInstance(
                NetworkElementMapper.class.getClassLoader(),
                new Class<?>[]{NetworkElementMapper.class},
                (proxy, method, args) -> {
                    if ("insert".equals(method.getName()) && args != null && args[0] instanceof NetworkElement element) {
                        insertedElements.add(element);
                        return 1;
                    }
                    if ("assignRegionsByGeometry".equals(method.getName())) {
                        assignRegionCalls[0]++;
                        return 1;
                    }
                    return defaultValue(method.getReturnType());
                });

        TopologyLinkMapper linkMapper = (TopologyLinkMapper) Proxy.newProxyInstance(
                TopologyLinkMapper.class.getClassLoader(),
                new Class<?>[]{TopologyLinkMapper.class},
                (proxy, method, args) -> {
                    if ("insert".equals(method.getName()) && args != null && args[0] instanceof TopologyLink link) {
                        insertedLinks.add(link);
                        return 1;
                    }
                    if ("delete".equals(method.getName())) {
                        linkDeleteCalls[0]++;
                        return 1;
                    }
                    return defaultValue(method.getReturnType());
                });

        SeedService seedService = new SeedService(elementMapper, linkMapper);

        seedService.seed(25, 0);

        assertThat(insertedElements).hasSize(25);
        assertThat(insertedLinks).isEmpty();
        assertThat(assignRegionCalls[0]).isEqualTo(1);
        assertThat(linkDeleteCalls[0]).isEqualTo(1);

        assertThat(insertedElements).allSatisfy(element -> {
            assertThat(element.getLng()).isBetween(CALIFORNIA_WEST, CALIFORNIA_EAST);
            assertThat(element.getLat()).isBetween(CALIFORNIA_SOUTH, CALIFORNIA_NORTH);
        });
    }

    @Test
    void seed_assignsDeterministicNetworkTierToFirewallElements() {
        List<NetworkElement> insertedElements = new ArrayList<>();

        NetworkElementMapper elementMapper = (NetworkElementMapper) Proxy.newProxyInstance(
                NetworkElementMapper.class.getClassLoader(),
                new Class<?>[]{NetworkElementMapper.class},
                (proxy, method, args) -> {
                    if ("insert".equals(method.getName()) && args != null && args[0] instanceof NetworkElement element) {
                        insertedElements.add(element);
                        return 1;
                    }
                    if ("assignRegionsByGeometry".equals(method.getName())) {
                        return 1;
                    }
                    return defaultValue(method.getReturnType());
                });

        TopologyLinkMapper linkMapper = (TopologyLinkMapper) Proxy.newProxyInstance(
                TopologyLinkMapper.class.getClassLoader(),
                new Class<?>[]{TopologyLinkMapper.class},
                (proxy, method, args) -> defaultValue(method.getReturnType()));

        SeedService seedService = new SeedService(elementMapper, linkMapper);

        seedService.seed(5000, 0);

        List<NetworkElement> firewalls = insertedElements.stream()
                .filter(element -> "firewall".equals(element.getType()))
                .toList();
        assertThat(firewalls).isNotEmpty();
        assertThat(firewalls).allSatisfy(element -> {
            assertThat(element.getProperties()).containsKey("networkTier");
            assertThat(element.getProperties().get("networkTier")).isIn("core", "aggregation", "access");
        });
        assertThat(firewalls)
                .anySatisfy(element -> assertThat(element.getProperties()).containsEntry("networkTier", "core"));
    }

    private static Object defaultValue(Class<?> type) {
        if (type == boolean.class) return false;
        if (type == byte.class) return (byte) 0;
        if (type == short.class) return (short) 0;
        if (type == int.class) return 0;
        if (type == long.class) return 0L;
        if (type == float.class) return 0.0f;
        if (type == double.class) return 0.0;
        if (type == char.class) return '\0';
        return null;
    }
}
