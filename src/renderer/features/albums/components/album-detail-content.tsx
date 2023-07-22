import { ColDef, RowDoubleClickedEvent, RowHeightParams, RowNode } from '@ag-grid-community/core';
import type { AgGridReact as AgGridReactType } from '@ag-grid-community/react/lib/agGridReact';
import { Box, Group, Stack } from '@mantine/core';
import { useSetState } from '@mantine/hooks';
import { MutableRefObject, useCallback, useMemo } from 'react';
import { RiHeartFill, RiHeartLine, RiMoreFill } from 'react-icons/ri';
import { generatePath, useParams } from 'react-router';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { AlbumListSort, LibraryItem, QueueSong, SortOrder } from '/@/renderer/api/types';
import { Button } from '/@/renderer/components';
import { MemoizedSwiperGridCarousel } from '/@/renderer/components/grid-carousel';
import { getColumnDefs, VirtualTable } from '/@/renderer/components/virtual-table';
import { FullWidthDiscCell } from '/@/renderer/components/virtual-table/cells/full-width-disc-cell';
import { useCurrentSongRowStyles } from '/@/renderer/components/virtual-table/hooks/use-current-song-row-styles';
import { useAlbumDetail } from '/@/renderer/features/albums/queries/album-detail-query';
import { useAlbumList } from '/@/renderer/features/albums/queries/album-list-query';
import {
    useHandleGeneralContextMenu,
    useHandleTableContextMenu,
} from '/@/renderer/features/context-menu';
import {
    ALBUM_CONTEXT_MENU_ITEMS,
    SONG_CONTEXT_MENU_ITEMS,
} from '/@/renderer/features/context-menu/context-menu-items';
import { usePlayQueueAdd } from '/@/renderer/features/player';
import { PlayButton, useCreateFavorite, useDeleteFavorite } from '/@/renderer/features/shared';
import { LibraryBackgroundOverlay } from '/@/renderer/features/shared/components/library-background-overlay';
import { useContainerQuery } from '/@/renderer/hooks';
import { AppRoute } from '/@/renderer/router/routes';
import { useCurrentServer } from '/@/renderer/store';
import { PersistedTableColumn, usePlayButtonBehavior } from '/@/renderer/store/settings.store';
import { Play, ServerType, TableColumn } from '/@/renderer/types';

const isFullWidthRow = (node: RowNode) => {
    return node.id?.startsWith('disc-');
};

const ContentContainer = styled.div`
    position: relative;
    z-index: 0;
`;

const DetailContainer = styled.div`
    display: flex;
    flex-direction: column;
    padding: 1rem 2rem 5rem;
    overflow: hidden;
`;

interface AlbumDetailContentProps {
    background?: string;
    tableRef: MutableRefObject<AgGridReactType | null>;
}

export const AlbumDetailContent = ({ tableRef, background }: AlbumDetailContentProps) => {
    const { albumId } = useParams() as { albumId: string };
    const server = useCurrentServer();
    const detailQuery = useAlbumDetail({ query: { id: albumId }, serverId: server?.id });
    const cq = useContainerQuery();
    const handlePlayQueueAdd = usePlayQueueAdd();

    // TODO: Make this customizable
    const columnDefs: ColDef[] = useMemo(() => {
        const userRatingColumn =
            detailQuery?.data?.serverType !== ServerType.JELLYFIN
                ? [
                      {
                          column: TableColumn.USER_RATING,
                          width: 0,
                      },
                  ]
                : [];

        const cols: PersistedTableColumn[] = [
            {
                column: TableColumn.TRACK_NUMBER,
                width: 0,
            },
            {
                column: TableColumn.TITLE_COMBINED,
                width: 0,
            },
            {
                column: TableColumn.DURATION,
                width: 0,
            },
            {
                column: TableColumn.BIT_RATE,
                width: 0,
            },
            {
                column: TableColumn.PLAY_COUNT,
                width: 0,
            },
            {
                column: TableColumn.LAST_PLAYED,
                width: 0,
            },
            ...userRatingColumn,
            {
                column: TableColumn.USER_FAVORITE,
                width: 0,
            },
        ];
        return getColumnDefs(cols).filter((c) => c.colId !== 'album' && c.colId !== 'artist');
    }, [detailQuery?.data?.serverType]);

    const getRowHeight = useCallback((params: RowHeightParams) => {
        if (isFullWidthRow(params.node)) {
            return 45;
        }

        return 60;
    }, []);

    const songsRowData = useMemo(() => {
        if (!detailQuery.data?.songs) {
            return [];
        }

        const uniqueDiscNumbers = new Set(detailQuery.data?.songs.map((s) => s.discNumber));
        const rowData: (QueueSong | { id: string; name: string })[] = [];

        for (const discNumber of uniqueDiscNumbers.values()) {
            const songsByDiscNumber = detailQuery.data?.songs.filter(
                (s) => s.discNumber === discNumber,
            );
            rowData.push({
                id: `disc-${discNumber}`,
                name: `Disc ${discNumber}`.toLocaleUpperCase(),
            });
            rowData.push(...songsByDiscNumber);
        }

        return rowData;
    }, [detailQuery.data?.songs]);

    const [pagination, setPagination] = useSetState({
        artist: 0,
    });

    const handleNextPage = useCallback(
        (key: 'artist') => {
            setPagination({
                [key]: pagination[key as keyof typeof pagination] + 1,
            });
        },
        [pagination, setPagination],
    );

    const handlePreviousPage = useCallback(
        (key: 'artist') => {
            setPagination({
                [key]: pagination[key as keyof typeof pagination] - 1,
            });
        },
        [pagination, setPagination],
    );

    const itemsPerPage = cq.isXl ? 9 : cq.isLg ? 7 : cq.isMd ? 5 : cq.isSm ? 4 : 3;

    const artistQuery = useAlbumList({
        options: {
            cacheTime: 1000 * 60,
            enabled: detailQuery?.data?.albumArtists[0]?.id !== undefined,
            keepPreviousData: true,
            staleTime: 1000 * 60,
        },
        query: {
            _custom: {
                jellyfin: {
                    AlbumArtistIds: detailQuery?.data?.albumArtists[0]?.id,
                    ExcludeItemIds: detailQuery?.data?.id,
                },
                navidrome: {
                    artist_id: detailQuery?.data?.albumArtists[0]?.id,
                },
            },
            limit: 10,
            sortBy: AlbumListSort.YEAR,
            sortOrder: SortOrder.DESC,
            startIndex: pagination.artist * itemsPerPage,
        },
        serverId: server?.id,
    });

    const carousels = [
        {
            data: artistQuery?.data?.items,
            isHidden: !artistQuery?.data?.items.length,
            loading: artistQuery?.isLoading || artistQuery.isFetching,
            pagination: {
                handleNextPage: () => handleNextPage('artist'),
                handlePreviousPage: () => handlePreviousPage('artist'),
                hasPreviousPage: pagination.artist > 0,
                itemsPerPage,
            },
            title: 'More from this artist',
            uniqueId: 'mostPlayed',
        },
    ];
    const playButtonBehavior = usePlayButtonBehavior();

    const handlePlay = async (playType?: Play) => {
        handlePlayQueueAdd?.({
            byData: detailQuery?.data?.songs,
            playType: playType || playButtonBehavior,
        });
    };

    const handleContextMenu = useHandleTableContextMenu(LibraryItem.SONG, SONG_CONTEXT_MENU_ITEMS);

    const handleRowDoubleClick = (e: RowDoubleClickedEvent<QueueSong>) => {
        if (!e.data || e.node.isFullWidthCell()) return;

        const rowData: QueueSong[] = [];
        e.api.forEachNode((node) => {
            if (!node.data || node.isFullWidthCell()) return;
            rowData.push(node.data);
        });

        handlePlayQueueAdd?.({
            byData: rowData,
            initialSongId: e.data.id,
            playType: playButtonBehavior,
        });
    };

    const createFavoriteMutation = useCreateFavorite({});
    const deleteFavoriteMutation = useDeleteFavorite({});

    const handleFavorite = () => {
        if (!detailQuery?.data) return;

        if (detailQuery.data.userFavorite) {
            deleteFavoriteMutation.mutate({
                query: {
                    id: [detailQuery.data.id],
                    type: LibraryItem.ALBUM,
                },
                serverId: detailQuery.data.serverId,
            });
        } else {
            createFavoriteMutation.mutate({
                query: {
                    id: [detailQuery.data.id],
                    type: LibraryItem.ALBUM,
                },
                serverId: detailQuery.data.serverId,
            });
        }
    };

    const showGenres = detailQuery?.data?.genres ? detailQuery?.data?.genres.length !== 0 : false;

    const handleGeneralContextMenu = useHandleGeneralContextMenu(
        LibraryItem.ALBUM,
        ALBUM_CONTEXT_MENU_ITEMS,
    );

    const { rowClassRules } = useCurrentSongRowStyles({ tableRef });

    return (
        <ContentContainer>
            <LibraryBackgroundOverlay backgroundColor={background} />
            <DetailContainer>
                <Box component="section">
                    <Group
                        py="1rem"
                        spacing="md"
                    >
                        <PlayButton onClick={() => handlePlay(playButtonBehavior)} />
                        <Group spacing="xs">
                            <Button
                                compact
                                loading={
                                    createFavoriteMutation.isLoading ||
                                    deleteFavoriteMutation.isLoading
                                }
                                variant="subtle"
                                onClick={handleFavorite}
                            >
                                {detailQuery?.data?.userFavorite ? (
                                    <RiHeartFill
                                        color="red"
                                        size={20}
                                    />
                                ) : (
                                    <RiHeartLine size={20} />
                                )}
                            </Button>
                            <Button
                                compact
                                variant="subtle"
                                onClick={(e) => {
                                    if (!detailQuery?.data) return;
                                    handleGeneralContextMenu(e, [detailQuery.data!]);
                                }}
                            >
                                <RiMoreFill size={20} />
                            </Button>
                        </Group>
                    </Group>
                </Box>
                {showGenres && (
                    <Box
                        component="section"
                        py="1rem"
                    >
                        <Group spacing="sm">
                            {detailQuery?.data?.genres?.map((genre) => (
                                <Button
                                    key={`genre-${genre.id}`}
                                    compact
                                    component={Link}
                                    radius={0}
                                    size="md"
                                    to={generatePath(
                                        `${AppRoute.LIBRARY_ALBUMS}?genre=${genre.id}`,
                                        {
                                            albumId,
                                        },
                                    )}
                                    variant="outline"
                                >
                                    {genre.name}
                                </Button>
                            ))}
                        </Group>
                    </Box>
                )}
                <Box style={{ minHeight: '300px' }}>
                    <VirtualTable
                        ref={tableRef}
                        autoFitColumns
                        autoHeight
                        stickyHeader
                        suppressCellFocus
                        suppressHorizontalScroll
                        suppressLoadingOverlay
                        suppressRowDrag
                        columnDefs={columnDefs}
                        enableCellChangeFlash={false}
                        fullWidthCellRenderer={FullWidthDiscCell}
                        getRowHeight={getRowHeight}
                        getRowId={(data) => data.data.id}
                        isFullWidthRow={(data) => {
                            return isFullWidthRow(data.rowNode) || false;
                        }}
                        isRowSelectable={(data) => {
                            if (isFullWidthRow(data.data)) return false;
                            return true;
                        }}
                        rowClassRules={rowClassRules}
                        rowData={songsRowData}
                        rowSelection="multiple"
                        onCellContextMenu={handleContextMenu}
                        onRowDoubleClicked={handleRowDoubleClick}
                    />
                </Box>
                <Stack
                    ref={cq.ref}
                    mt="5rem"
                >
                    {cq.height || cq.width ? (
                        <>
                            {carousels
                                .filter((c) => !c.isHidden)
                                .map((carousel, index) => (
                                    <MemoizedSwiperGridCarousel
                                        key={`carousel-${carousel.uniqueId}-${index}`}
                                        cardRows={[
                                            {
                                                property: 'name',
                                                route: {
                                                    route: AppRoute.LIBRARY_ALBUMS_DETAIL,
                                                    slugs: [
                                                        {
                                                            idProperty: 'id',
                                                            slugProperty: 'albumId',
                                                        },
                                                    ],
                                                },
                                            },
                                            {
                                                arrayProperty: 'name',
                                                property: 'albumArtists',
                                                route: {
                                                    route: AppRoute.LIBRARY_ALBUM_ARTISTS_DETAIL,
                                                    slugs: [
                                                        {
                                                            idProperty: 'id',
                                                            slugProperty: 'albumArtistId',
                                                        },
                                                    ],
                                                },
                                            },
                                        ]}
                                        data={carousel.data}
                                        isLoading={carousel.loading}
                                        itemType={LibraryItem.ALBUM}
                                        route={{
                                            route: AppRoute.LIBRARY_ALBUMS_DETAIL,
                                            slugs: [{ idProperty: 'id', slugProperty: 'albumId' }],
                                        }}
                                        title={{
                                            label: carousel.title,
                                        }}
                                        uniqueId={carousel.uniqueId}
                                    />
                                ))}
                        </>
                    ) : null}
                </Stack>
            </DetailContainer>
        </ContentContainer>
    );
};
