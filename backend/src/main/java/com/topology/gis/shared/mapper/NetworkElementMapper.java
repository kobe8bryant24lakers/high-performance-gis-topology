package com.topology.gis.shared.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.topology.gis.shared.entity.NetworkElement;
import org.apache.ibatis.annotations.Param;

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
            @Param("limit") int limit
    );

    List<NetworkElement> search(
            @Param("query") String query,
            @Param("types") String types,
            @Param("limit") int limit
    );

    long countSearch(@Param("query") String query, @Param("types") String types);
}
