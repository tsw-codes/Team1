import { useState, useEffect } from 'react'

/**
 * Hook for loading async data in page components.
 *
 * Usage:
 *   const { data, loading, error, refetch } = useAsyncData(() => getAllInventory())
 *   const { data, loading, error } = useAsyncData(() => getRequestById(id), [id])
 *
 * @param {Function} asyncFn  - Async function that returns data
 * @param {Array}    deps     - Dependency array (re-fetches when deps change)
 * @returns {{ data: any, loading: boolean, error: Error|null, setData: Function, refetch: Function }}
 */
export function useAsyncData(asyncFn, deps = []) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  function fetch() {
    let cancelled = false
    setLoading(true)
    setError(null)

    asyncFn()
      .then((result) => {
        if (!cancelled) {
          setData(result)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err)
          setLoading(false)
        }
      })

    return () => { cancelled = true }
  }

  useEffect(fetch, deps)

  function refetch() {
    fetch()
  }

  return { data, loading, error, setData, refetch }
}
