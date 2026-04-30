package com.topology.gis.shared.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.topology.gis.shared.dto.EndpointStubDto;
import com.topology.gis.shared.entity.NetworkElement;
import org.apache.ibatis.annotations.Param;

import java.util.Collection;
import java.util.List;

public interface NetworkElementMapper extends BaseMapper<NetworkElement> {

    // Defined in NetworkElementMapper.xml — requires explicit resultMap for JsonbTypeHandler
    List<NetworkElement> findInTile(
            @Param("west") double west,
            @Param("south") double south,
            @Param("east") double east,
            @Param("north") double north,
            @Param("types") String types,
            @Param("propFilter") String propFilter,
            @Param("networkTiers") String networkTiers,
            @Param("limit") int limit
    );

    List<String> findIdsInTile(
            @Param("west") double west,
            @Param("south") double south,
            @Param("east") double east,
            @Param("north") double north,
            @Param("types") String types,
            @Param("propFilter") String propFilter,
            @Param("networkTiers") String networkTiers,
            @Param("limit") int limit
    );

    List<EndpointStubDto> findEndpointStubsByIds(@Param("ids") Collection<String> ids);

    List<NetworkElement> search(
            @Param("query") String query,
            @Param("types") String types,
            @Param("limit") int limit
    );

    long countSearch(@Param("query") String query, @Param("types") String types);

    /**
     * Backfills country/province/city region IDs by spatially joining each element's location
     * against the regions table. Uses ST_Intersects so points exactly on shared boundaries still
     * resolve to a region; ORDER BY r.id provides deterministic tie-breaking. Idempotent — safe
     * to run after every reseed; relies on the GiST index on regions.geom for performance.
     */
    int assignRegionsByGeometry();
}
