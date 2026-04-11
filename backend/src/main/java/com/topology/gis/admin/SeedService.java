package com.topology.gis.admin;

import com.topology.gis.shared.entity.NetworkElement;
import com.topology.gis.shared.entity.TopologyLink;
import com.topology.gis.shared.mapper.NetworkElementMapper;
import com.topology.gis.shared.mapper.TopologyLinkMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Service
public class SeedService {

    private static final String[] ELEMENT_TYPES = {"router", "switch", "server", "firewall", "access-point"};
    private static final OffsetDateTime SEED_TIME =
            OffsetDateTime.of(2026, 1, 1, 0, 0, 0, 0, ZoneOffset.UTC);

    private final NetworkElementMapper elementMapper;
    private final TopologyLinkMapper linkMapper;

    public SeedService(NetworkElementMapper elementMapper, TopologyLinkMapper linkMapper) {
        this.elementMapper = elementMapper;
        this.linkMapper = linkMapper;
    }

    /**
     * LCG PRNG matching the TypeScript data-generator.ts implementation.
     * seed = (seed * 16807) % 2147483647
     * value = (seed - 1) / 2147483646
     *
     * IMPORTANT: seed state must NOT be reset between generateElements and generateLinks
     * to match the TypeScript mock's output.
     */
    private long seed;

    private double seededRandom() {
        seed = (seed * 16807L) % 2147483647L;
        return (seed - 1.0) / 2147483646.0;
    }

    @Transactional
    public void seed(int elementCount, int linkCount) {
        // Clear existing data
        linkMapper.delete(null);
        elementMapper.delete(null);

        seed = 42L;  // Starting seed matches TypeScript resetSeed(42)

        // Generate elements
        List<NetworkElement> elements = new ArrayList<>(elementCount);
        for (int i = 0; i < elementCount; i++) {
            double lng = seededRandom() * 360.0 - 180.0;
            double lat = seededRandom() * 180.0 - 90.0;
            int typeIdx = (int) (seededRandom() * ELEMENT_TYPES.length);
            String type = ELEMENT_TYPES[typeIdx];

            NetworkElement el = new NetworkElement();
            el.setId("el-" + i);
            el.setType(type);
            el.setLabel(type + "-" + i);
            el.setLng(lng);
            el.setLat(lat);
            el.setVersion(1);
            el.setUpdatedAt(SEED_TIME);
            el.setProperties(Map.of("index", i));
            elements.add(el);
        }

        // Batch insert elements in chunks of 1000
        batchInsertElements(elements);

        // Generate links — seed continues from where elements left off (no reset)
        List<TopologyLink> links = new ArrayList<>(linkCount);
        for (int i = 0; i < linkCount; i++) {
            int srcIdx = (int) (seededRandom() * elementCount);
            int tgtIdx = (int) (seededRandom() * elementCount);
            if (tgtIdx == srcIdx) {
                tgtIdx = (tgtIdx + 1) % elementCount;
            }

            TopologyLink link = new TopologyLink();
            link.setId("link-" + i);
            link.setType("connection");
            link.setSourceId("el-" + srcIdx);
            link.setTargetId("el-" + tgtIdx);
            link.setDirected(false);
            link.setVersion(1);
            link.setUpdatedAt(SEED_TIME);
            link.setProperties(Map.of());
            links.add(link);
        }

        batchInsertLinks(links);
    }

    private void batchInsertElements(List<NetworkElement> elements) {
        int batchSize = 500;
        for (int i = 0; i < elements.size(); i += batchSize) {
            List<NetworkElement> batch = elements.subList(i, Math.min(i + batchSize, elements.size()));
            batch.forEach(elementMapper::insert);
        }
    }

    private void batchInsertLinks(List<TopologyLink> links) {
        int batchSize = 500;
        for (int i = 0; i < links.size(); i += batchSize) {
            List<TopologyLink> batch = links.subList(i, Math.min(i + batchSize, links.size()));
            batch.forEach(linkMapper::insert);
        }
    }
}
