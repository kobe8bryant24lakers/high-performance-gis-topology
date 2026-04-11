package com.topology.gis;

import com.topology.gis.dto.NeighborsResponse;
import com.topology.gis.dto.NetworkElementDto;
import com.topology.gis.service.SeedService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import static org.assertj.core.api.Assertions.assertThat;

class ElementControllerIntegrationTest extends BaseIntegrationTest {

    @Autowired
    private SeedService seedService;

    @BeforeEach
    void setUp() {
        seedService.seed(100, 60);
    }

    @Test
    void getElementById_existingId_returns200() {
        ResponseEntity<NetworkElementDto> resp = restTemplate.getForEntity(
                "/api/topology/elements/el-0", NetworkElementDto.class);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(resp.getBody()).isNotNull();
        assertThat(resp.getBody().id()).isEqualTo("el-0");
        assertThat(resp.getBody().lng()).isBetween(-180.0, 180.0);
        assertThat(resp.getBody().lat()).isBetween(-90.0, 90.0);
    }

    @Test
    void getElementById_nonExistentId_returns404() {
        ResponseEntity<String> resp = restTemplate.getForEntity(
                "/api/topology/elements/nonexistent-id", String.class);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void getNeighbors_depth1_returnsDirectConnections() {
        ResponseEntity<NeighborsResponse> resp = restTemplate.getForEntity(
                "/api/topology/elements/el-0/neighbors?depth=1", NeighborsResponse.class);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(resp.getBody()).isNotNull();
        // All returned elements should be neighbors, not the element itself
        resp.getBody().elements().forEach(e -> assertThat(e.id()).isNotEqualTo("el-0"));
    }

    @Test
    void getNeighbors_depth3_returnsUpToThreeHops() {
        ResponseEntity<NeighborsResponse> depth1 = restTemplate.getForEntity(
                "/api/topology/elements/el-0/neighbors?depth=1", NeighborsResponse.class);
        ResponseEntity<NeighborsResponse> depth3 = restTemplate.getForEntity(
                "/api/topology/elements/el-0/neighbors?depth=3", NeighborsResponse.class);

        assertThat(depth1.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(depth3.getStatusCode()).isEqualTo(HttpStatus.OK);
        // depth=3 should return at least as many elements as depth=1
        assertThat(depth3.getBody().elements().size())
                .isGreaterThanOrEqualTo(depth1.getBody().elements().size());
    }

    @Test
    void getNeighbors_nonExistentId_returns404() {
        ResponseEntity<String> resp = restTemplate.getForEntity(
                "/api/topology/elements/nonexistent-id/neighbors", String.class);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }
}
