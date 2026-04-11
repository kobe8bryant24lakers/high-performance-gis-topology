package com.topology.gis.tile;

import com.topology.gis.shared.dto.TopologyClusterDto;
import com.topology.gis.shared.entity.NetworkElement;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class ClusteringService {

    /**
     * Divides the tile bounding box into 4 equal quadrants and assigns each element to one.
     * Mirrors the TypeScript generateClustersForTile() in data-generator.ts exactly.
     *
     * Quadrant index: qi = (lng >= midLng ? 1 : 0) + (lat >= midLat ? 2 : 0)
     *   q0=SW  q1=SE  q2=NW  q3=NE
     */
    public List<TopologyClusterDto> cluster(
            List<NetworkElement> elements,
            int z, int x, int y,
            TileService.TileBBox bbox) {

        double midLng = (bbox.west() + bbox.east()) / 2.0;
        double midLat = (bbox.south() + bbox.north()) / 2.0;

        // Centroid = center of each quadrant bbox (NOT spatial mean)
        double[] cLngs = {
                (bbox.west() + midLng) / 2.0,   // q0: SW
                (midLng + bbox.east()) / 2.0,    // q1: SE
                (bbox.west() + midLng) / 2.0,    // q2: NW
                (midLng + bbox.east()) / 2.0     // q3: NE
        };
        double[] cLats = {
                (bbox.south() + midLat) / 2.0,  // q0
                (bbox.south() + midLat) / 2.0,  // q1
                (midLat + bbox.north()) / 2.0,  // q2
                (midLat + bbox.north()) / 2.0   // q3
        };

        Map<Integer, List<NetworkElement>> quadrants = new HashMap<>();
        for (NetworkElement el : elements) {
            int qi = (el.getLng() >= midLng ? 1 : 0) + (el.getLat() >= midLat ? 2 : 0);
            quadrants.computeIfAbsent(qi, k -> new ArrayList<>()).add(el);
        }

        List<TopologyClusterDto> clusters = new ArrayList<>();
        for (int qi = 0; qi < 4; qi++) {
            List<NetworkElement> group = quadrants.getOrDefault(qi, List.of());
            if (group.isEmpty()) continue;

            Map<String, Integer> typeCounts = new HashMap<>();
            List<String> childIds = new ArrayList<>();
            for (NetworkElement el : group) {
                typeCounts.merge(el.getType(), 1, Integer::sum);
                childIds.add(el.getId());
            }

            String clusterId = String.format("tile:%d/%d/%d:q%d", z, x, y, qi);
            clusters.add(new TopologyClusterDto(
                    clusterId,
                    cLngs[qi],
                    cLats[qi],
                    group.size(),
                    childIds,
                    typeCounts
            ));
        }
        return clusters;
    }
}
