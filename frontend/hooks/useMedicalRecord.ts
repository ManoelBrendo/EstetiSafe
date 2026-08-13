import { useQuery } from '@tanstack/react-query'
import {
  getClientMedicalRecord,
  getClientProtocols,
  getClientPayments,
  getClientFacialPoints,
} from '../clientRecordsApi'
import { normalizeAnamnesisRecord } from '../anamnesis'
import type { AnamnesisRecordVersion, ClientRecord } from '../clinicalTypes'
import { useMemo } from 'react'

/**
 * Hook centralizado para buscar e derivar todos os dados do prontuário de um cliente.
 * Substitui o padrão manual useState + useCallback + useEffect em ClienteProntuario.tsx.
 */
export function useMedicalRecord(clientId: string | undefined) {
  const medicalRecordQuery = useQuery({
    queryKey: ['medicalRecord', clientId],
    queryFn: () => getClientMedicalRecord(clientId!),
    enabled: Boolean(clientId),
    staleTime: 1000 * 60 * 2, // 2 minutos de cache
    retry: 1,
  })

  const protocolsQuery = useQuery({
    queryKey: ['protocols', clientId],
    queryFn: () => getClientProtocols(clientId!),
    enabled: Boolean(clientId),
    staleTime: 1000 * 60 * 5,
    retry: 1,
  })

  const paymentsQuery = useQuery({
    queryKey: ['payments', clientId],
    queryFn: () => getClientPayments(clientId!),
    enabled: Boolean(clientId),
    staleTime: 1000 * 60 * 2,
    retry: 1,
  })

  const facialPointsQuery = useQuery({
    queryKey: ['facialPoints', clientId],
    queryFn: () => getClientFacialPoints(clientId!),
    enabled: Boolean(clientId),
    staleTime: 1000 * 30,
    retry: 1,
  })

  const medicalRecord = medicalRecordQuery.data ?? null
  const client: ClientRecord | null = medicalRecord?.client ?? null
  const anamnesisHistory: AnamnesisRecordVersion[] = medicalRecord?.anamnesisHistory ?? []

  const latestAnamnesis = useMemo<AnamnesisRecordVersion | null>(
    () => (anamnesisHistory[0] ? normalizeAnamnesisRecord(anamnesisHistory[0], client || {}) : null),
    [anamnesisHistory, client]
  )

  const allHistoricalPhotos = useMemo(() => {
    const photosList: { id: string; dataUrl: string; caption?: string; date: string }[] = []
    anamnesisHistory.forEach(record => {
      const normalized = normalizeAnamnesisRecord(record, client || {})
      const recordPhotos = normalized?.photoRecord?.photos || []
      recordPhotos.forEach(p => {
        if (!photosList.some(item => item.dataUrl === p.dataUrl)) {
          photosList.push({ id: p.id, dataUrl: p.dataUrl, caption: p.caption, date: record.filledAt || '' })
        }
      })
    })
    return photosList
  }, [anamnesisHistory, client])

  const isLoading =
    medicalRecordQuery.isLoading ||
    protocolsQuery.isLoading ||
    paymentsQuery.isLoading ||
    facialPointsQuery.isLoading

  const error =
    medicalRecordQuery.error ||
    protocolsQuery.error ||
    paymentsQuery.error ||
    facialPointsQuery.error

  return {
    // Loading / error
    isLoading,
    error,

    // Core data
    client,
    medicalRecord,
    anamnesisHistory,
    protocolBundle: protocolsQuery.data ?? null,
    paymentsBundle: paymentsQuery.data ?? null,
    facialPoints: facialPointsQuery.data ?? [],

    // Derived data
    latestAnamnesis,
    allHistoricalPhotos,

    // Query instances (for manual invalidation when needed)
    queries: {
      medicalRecord: medicalRecordQuery,
      protocols: protocolsQuery,
      payments: paymentsQuery,
      facialPoints: facialPointsQuery,
    },
  }
}
