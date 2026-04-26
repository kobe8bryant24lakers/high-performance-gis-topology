package com.topology.gis.admin;

import com.topology.gis.shared.entity.NetworkElement;
import com.topology.gis.shared.entity.TopologyLink;
import com.topology.gis.shared.mapper.NetworkElementMapper;
import com.topology.gis.shared.mapper.TopologyLinkMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

@Service
public class SeedService {

    private static final Logger log = LoggerFactory.getLogger(SeedService.class);
    private static final String[] ELEMENT_TYPES = {"router", "switch", "server", "firewall", "access-point"};
    private static final OffsetDateTime SEED_TIME =
            OffsetDateTime.of(2026, 1, 1, 0, 0, 0, 0, ZoneOffset.UTC);
    private static final int BATCH_SIZE = 500;

    /** Guards against concurrent seed invocations, which would cause overlapping deletes/inserts. */
    private final AtomicBoolean seeding = new AtomicBoolean(false);

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
     * IMPORTANT: seed state must NOT be reset between element and link generation
     * to match the TypeScript mock's output.
     */
    private long lcgSeed;

    private double seededRandom() {
        lcgSeed = (lcgSeed * 16807L) % 2147483647L;
        return (lcgSeed - 1.0) / 2147483646.0;
    }

    /**
     * Atomically clears all topology data and reseeds with random elements and links.
     * The entire operation runs in a single transaction: if any insert fails the delete
     * is rolled back and the previous dataset is preserved.
     * Elements and links are generated and inserted in bounded chunks so the full dataset
     * is never held in memory at once.
     *
     * @throws IllegalStateException if a seed operation is already in progress
     */
    @Transactional
    public void seed(int elementCount, int linkCount) {
        if (!seeding.compareAndSet(false, true)) {
            throw new IllegalStateException("A seed operation is already in progress");
        }
        try {
            log.info("Seeding topology: {} elements, {} links", elementCount, linkCount);
            linkMapper.delete(null);
            elementMapper.delete(null);
            lcgSeed = 42L;  // Starting seed matches TypeScript resetSeed(42)
            insertElements(elementCount);
            insertLinks(elementCount, linkCount);
            elementMapper.assignRegionsByGeometry();
            log.info("Seeding complete");
        } catch (RuntimeException ex) {
            seeding.set(false);   // release before Spring rolls back so flag is consistent
            throw ex;
        } finally {
            seeding.set(false);
        }
    }

    /**
     * Generates and inserts elements in chunks of BATCH_SIZE.
     * Each chunk is committed independently — the full list is never in memory.
     * Region IDs are backfilled by {@link #seed} via {@code assignRegionsByGeometry}
     * after all rows are inserted, so the regions table is the single source of truth
     * for the country/province/city grid.
     */
    private void insertElements(int elementCount) {
        for (int i = 0; i < elementCount; i += BATCH_SIZE) {
            int end = Math.min(i + BATCH_SIZE, elementCount);
            List<NetworkElement> batch = new ArrayList<>(end - i);
            for (int j = i; j < end; j++) {
                double lng = seededRandom() * 360.0 - 180.0;
                double lat = seededRandom() * 180.0 - 90.0;
                int typeIdx = (int) (seededRandom() * ELEMENT_TYPES.length);
                String type = ELEMENT_TYPES[typeIdx];

                NetworkElement el = new NetworkElement();
                el.setId("el-" + j);
                el.setType(type);
                el.setLabel(type + "-" + j);
                el.setLng(lng);
                el.setLat(lat);
                el.setVersion(1);
                el.setUpdatedAt(SEED_TIME);
                el.setProperties(Map.of("index", j));
                batch.add(el);
            }
            insertElementBatch(batch);
        }
    }

    /**
     * Generates and inserts links in chunks of BATCH_SIZE.
     * Element IDs are deterministic ("el-N") so no element list is needed.
     * Seed state continues from where insertElements left off.
     */
    private void insertLinks(int elementCount, int linkCount) {
        for (int i = 0; i < linkCount; i += BATCH_SIZE) {
            int end = Math.min(i + BATCH_SIZE, linkCount);
            List<TopologyLink> batch = new ArrayList<>(end - i);
            for (int j = i; j < end; j++) {
                int srcIdx = (int) (seededRandom() * elementCount);
                int tgtIdx = (int) (seededRandom() * elementCount);
                if (tgtIdx == srcIdx) {
                    tgtIdx = (tgtIdx + 1) % elementCount;
                }

                TopologyLink link = new TopologyLink();
                link.setId("link-" + j);
                link.setType("connection");
                link.setSourceId("el-" + srcIdx);
                link.setTargetId("el-" + tgtIdx);
                link.setDirected(false);
                link.setVersion(1);
                link.setUpdatedAt(SEED_TIME);
                link.setProperties(Map.of());
                batch.add(link);
            }
            insertLinkBatch(batch);
        }
    }

    private void insertElementBatch(List<NetworkElement> batch) {
        batch.forEach(elementMapper::insert);
    }

    private void insertLinkBatch(List<TopologyLink> batch) {
        batch.forEach(linkMapper::insert);
    }
}
