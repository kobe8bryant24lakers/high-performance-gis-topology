package com.topology.gis.shared.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.topology.gis.shared.entity.TopologyLink;
import org.apache.ibatis.annotations.Param;
import java.util.List;

public interface TopologyLinkMapper extends BaseMapper<TopologyLink> {

    // Defined in TopologyLinkMapper.xml — requires explicit resultMap for JsonbTypeHandler
    List<TopologyLink> findLinksForElements(
            @Param("ids") List<String> ids,
            @Param("types") String types,
            @Param("limit") int limit);

    // Defined in TopologyLinkMapper.xml — recursive CTE too complex for inline @Select
    List<String> findNeighborIds(@Param("startId") String startId, @Param("maxDepth") int maxDepth);

    List<TopologyLink> findNeighborLinks(@Param("startId") String startId, @Param("maxDepth") int maxDepth);
}
