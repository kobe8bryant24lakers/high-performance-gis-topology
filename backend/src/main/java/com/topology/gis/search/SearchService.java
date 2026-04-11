package com.topology.gis.search;

import com.topology.gis.search.dto.SearchResponse;
import com.topology.gis.shared.dto.NetworkElementDto;
import com.topology.gis.shared.mapper.NetworkElementMapper;
import com.topology.gis.tile.TileService;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class SearchService {

    private final NetworkElementMapper elementMapper;
    private final TileService tileService;

    public SearchService(NetworkElementMapper elementMapper, TileService tileService) {
        this.elementMapper = elementMapper;
        this.tileService = tileService;
    }

    public SearchResponse search(String query, int limit, List<String> types) {
        if (query == null || query.isBlank()) {
            return new SearchResponse(List.of(), 0);
        }
        // ILIKE wildcard wrapping for prefix/substring match
        String likeQuery = "%" + query.toLowerCase() + "%";
        String typesParam = TileService.toTypesParam(types);

        List<NetworkElementDto> results = elementMapper.search(likeQuery, typesParam, limit)
                .stream()
                .map(tileService::toDto)
                .toList();

        long total = elementMapper.countSearch(likeQuery, typesParam);

        return new SearchResponse(results, total);
    }
}
