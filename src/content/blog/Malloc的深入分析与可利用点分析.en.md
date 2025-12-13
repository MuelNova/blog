---
title: Malloc的源码审计
description: 这篇博客文章主要由作者nova编写，详细分析了glibc库中malloc函数的实现及其可利用的漏洞点。
pubDate: 2022-06-30
tags:
- CTF
- Pwn
- glibc
authors:
- nova

---
---
title: Malloc Source Code Analysis
date: 2022-06-30
tags: ["CTF", "Pwn", "glibc"]
authors: [nova]
---

Consistenting fastbin before moving to smallbin. It may seem excessive to clear all fastbins before checking for available space, but it helps avoid fragmentation problems usually associated with fastbins. Additionally, in reality, programs often make consecutive small or large requests, rather than a mix of both. Thus, consolidation is not frequently needed in most programs. Programs that require frequent consolidation usually tend to fragment.

Next chunk of code will be fetching largebin.### Fragment Consolidation

```c
    malloc_consolidate (av);
```

#### malloc_consolidate()

Defined in `malloc.c` at [#4704](https://sourceware.org/git/?p=glibc.git;a=blob;f=malloc/malloc.c;h=09e5ff2bce5d79b3754687db3aef314640d336eb;hb=HEAD#l4704)

```c
/*
  ------------------------- malloc_consolidate -------------------------

  malloc_consolidate is a specialized version of free() that tears
  down chunks held in fastbins.  Free itself cannot be used for this
  purpose since, among other things, it might place chunks back onto
  fastbins.  So, instead, we need to use a minor variant of the same
  code.
*/

static void malloc_consolidate(mstate av)
{
  mfastbinptr*    fb;                 /* current fastbin being consolidated */
  mfastbinptr*    maxfb;              /* last fastbin (for loop control) */
  mchunkptr       p;                  /* current chunk being consolidated */
  mchunkptr       nextp;              /* next chunk to consolidate */
  mchunkptr       unsorted_bin;       /* bin header */
  mchunkptr       first_unsorted;     /* chunk to link to */

  /* These have same use as in free() */
  mchunkptr       nextchunk;
  INTERNAL_SIZE_T size;
  INTERNAL_SIZE_T nextsize;
  INTERNAL_SIZE_T prevsize;
  int             nextinuse;

  atomic_store_relaxed (&av->have_fastchunks, false);

  unsorted_bin = unsorted_chunks(av);

  /*
    Remove each chunk from fast bin and consolidate it, placing it
    then in unsorted bin. Among other reasons for doing this,
    placing in unsorted bin avoids needing to calculate actual bins
    until malloc is sure that chunks aren't immediately going to be
    reused anyway.
  */
  /* Loop starting from the first chunk, consolidate all chunks */
  maxfb = &fastbin (av, NFASTBINS - 1);
  fb = &fastbin (av, 0);
  do {
    p = atomic_exchange_acq (fb, NULL);
    if (p != 0) {
      do {
	{
	  if (__glibc_unlikely (misaligned_chunk (p))) // Pointers must be aligned
	    malloc_printerr ("malloc_consolidate(): "
			     "unaligned fastbin chunk detected");

	  unsigned int idx = fastbin_index (chunksize (p));
	  if ((&fastbin (av, idx)) != fb) // Fastbin chunk check
	    malloc_printerr ("malloc_consolidate(): invalid chunk size");
	}

	check_inuse_chunk(av, p);
	nextp = REVEAL_PTR (p->fd);

	/* Slightly streamlined version of consolidation code in free() */
	size = chunksize (p);
	nextchunk = chunk_at_offset(p, size);
	nextsize = chunksize(nextchunk);

	if (!prev_inuse(p)) {
	  prevsize = prev_size (p);
	  size += prevsize;
	  p = chunk_at_offset(p, -((long) prevsize));
      /* Check if prevsize and size are equal */
	  if (__glibc_unlikely (chunksize(p) != prevsize))
	    malloc_printerr ("corrupted size vs. prev_size in fastbins");
	  unlink_chunk (av, p); // Unlink the prev chunk
	}

	if (nextchunk != av->top) {
	  nextinuse = inuse_bit_at_offset(nextchunk, nextsize);

	  if (!nextinuse) {
	    size += nextsize;
	    unlink_chunk (av, nextchunk);
	  } else
	    clear_inuse_bit_at_offset(nextchunk, 0);

       /* Insert p at the head of a linked list */
	  first_unsorted = unsorted_bin->fd;
	  unsorted_bin->fd = p;
	  first_unsorted->bk = p;

	  if (!in_smallbin_range (size)) {
	    p->fd_nextsize = NULL;
	    p->bk_nextsize = NULL;
	  }

	  set_head(p, size | PREV_INUSE);
	  p->bk = unsorted_bin;
	  p->fd = first_unsorted;
	  set_foot(p, size);
	}
    // next chunk = av -> top, consolidate to topchunk
	else {
	  size += nextsize;
	  set_head(p, size | PREV_INUSE);
	  av->top = p;
	}

      } while ( (p = nextp) != 0);

    }
  } while (fb++ != maxfb);
}
```

Firstly, set the PREV_INUSE of the next adjacent chunk to 1. If the previous adjacent chunk is free, merge it. Then check if the next chunk is free and merge if needed. Regardless of whether the merge is complete or not, place the `fastbin` or the bin after consolidation into the `unsorted_bin`. (If adjacent to the `top chunk`, merge it with the `top chunk`)

### Iteration

~~So long that my head is spinning...~~

```c
/*
     Process recently freed or remaindered chunks, taking one only if
     it is exact fit, or, if this a small request, the chunk is remainder from
     the most recent non-exact fit.  Place other traversed chunks in
     bins.  Note that this step is the only place in any routine where
     chunks are placed in bins.

     The outer loop here is needed because we might not realize until
     near the end of malloc that we should have consolidated, so must
     do so and retry. This happens at most once, and only when we would
     otherwise need to expand memory to service a "small" request.
   */

#if USE_TCACHE
  INTERNAL_SIZE_T tcache_nb = 0;
  size_t tc_idx = csize2tidx (nb);
  if (tcache && tc_idx < mp_.tcache_bins)
    tcache_nb = nb;
  int return_cached = 0; // Flag indicating that the appropriately sized chunk has been put into tcache

  tcache_unsorted_count = 0; // Number of processed unsorted chunks
```

Loop through and place `unsorted_bin` into the corresponding `bin`

```c
  for (;; )
    {
      int iters = 0;
      while ((victim = unsorted_chunks (av)->bk) != unsorted_chunks (av)) // Have all unsorted chunks been retrieved
        {
          bck = victim->bk;
          size = chunksize (victim);
          mchunkptr next = chunk_at_offset (victim, size);
          // Some safety checks
          if (__glibc_unlikely (size <= CHUNK_HDR_SZ)
              || __glibc_unlikely (size > av->system_mem))
            malloc_printerr ("malloc(): invalid size (unsorted)");
          if (__glibc_unlikely (chunksize_nomask (next) < CHUNK_HDR_SZ)
              || __glibc_unlikely (chunksize_nomask (next) > av->system_mem))
            malloc_printerr ("malloc(): invalid next size (unsorted)");
          if (__glibc_unlikely ((prev_size (next) & ~(SIZE_BITS)) != size))
            malloc_printerr ("malloc(): mismatching next->prev_size (unsorted)");
          if (__glibc_unlikely (bck->fd != victim)
              || __glibc_unlikely (victim->fd != unsorted_chunks (av)))
            malloc_printerr ("malloc(): unsorted double linked list corrupted");
          if (__glibc_unlikely (prev_inuse (next)))
            malloc_printerr ("malloc(): invalid next->prev_inuse (unsorted)");

          /*
             If a small request, try to use last remainder if it is the
             only chunk in unsorted bin.  This helps promote locality for
             runs of consecutive small requests. This is the only
             exception to best-fit, and applies only when there is
             no exact fit for a small chunk.
           */


          if (in_smallbin_range (nb) && // Within the small bin range
              bck == unsorted_chunks (av) && // Only one chunk in unsorted_bin
              victim == av->last_remainder && // Is the last remainder
              (unsigned long) (size) > (unsigned long) (nb + MINSIZE)) // If size is greater than nb + MINSIZE, i.e., chunk can still be a chunk after `nb` memory is taken
            {
              /* split and reattach remainder */
              remainder_size = size - nb;
              remainder = chunk_at_offset (victim, nb); // Remaining remainder
              unsorted_chunks (av)->bk = unsorted_chunks (av)->fd = remainder; // Reconstruct unsorted_bin linked list
              av->last_remainder = remainder;
              remainder->bk = remainder->fd = unsorted_chunks (av);
              if (!in_smallbin_range (remainder_size))
                {
                  remainder->fd_nextsize = NULL;
                  remainder->bk_nextsize = NULL;
                }

              set_head (victim, nb | PREV_INUSE |
                        (av != &main_arena ? NON_MAIN_ARENA : 0)); // Flag for nb
              set_head (remainder, remainder_size | PREV_INUSE); // Flag for remainder
              set_foot (remainder, remainder_size);

              check_malloced_chunk (av, victim, nb);
              void *p = chunk2mem (victim);
              alloc_perturb (p, bytes);
              return p; // Return nb
            }

          // More checks...
          /* remove from unsorted list */
          if (__glibc_unlikely (bck->fd != victim))
            malloc_printerr ("malloc(): corrupted unsorted chunks 3");

          // Retrieve the head chunk
          unsorted_chunks (av)->bk = bck;
          bck->fd = unsorted_chunks (av);

          /* Take now instead of binning if exact fit */

          if (size == nb)
            {
              // Set the flag
              set_inuse_bit_at_offset (victim, size);
              if (av != &main_arena)
		set_non_main_arena (victim);
#if USE_TCACHE
	      /* Fill cache first, return to user only if cache fills.
		 We may return one of these chunks later.  */
	      if (tcache_nb
		  && tcache->counts[tc_idx] < mp_.tcache_count)
		{
           // Put victim into tcache instead of returning
           // Since in most cases, a size that has just been needed has a higher probability of continuance, it is put into tcache
		  tcache_put (victim, tc_idx);
		  return_cached = 1;
		  continue;
		}
	      else
		{
#endif
              check_malloced_chunk (av, victim, nb);
              void *p = chunk2mem (victim);
              alloc_perturb (p, bytes);
              return p;
#if USE_TCACHE
		}
#endif
            }

          /* place chunk in bin */

          if (in_smallbin_range (size)) // Place into small bin
            {
              victim_index = smallbin_index (size);
              bck = bin_at (av, victim_index);
              fwd = bck->fd;
            }
          else
            {
              victim_index = largebin_index (size);
              bck = bin_at (av, victim_index);
              fwd = bck->fd;

              /* maintain large bins in sorted order */
              if (fwd != bck) // If large bin is not empty
                {
                  /* Or with inuse bit to speed comparisons */
                  size |= PREV_INUSE; // Set PREV_INUSE to 1
                  /* if smaller than smallest, bypass loop below */
                  assert (chunk_main_arena (bck->bk));
                  /* Insert directly at the end of the large bin */
                  if ((unsigned long) (size)
		      < (unsigned long) chunksize_nomask (bck->bk))
                    {
                      fwd = bck;
                      bck = bck->bk;

                      victim->fd_nextsize = fwd->fd;
                      victim->bk_nextsize = fwd->fd->bk_nextsize;
                      fwd->fd->bk_nextsize = victim->bk_nextsize->fd_nextsize = victim;
                    }
                  else
                    {
                      assert (chunk_main_arena (fwd));
                      /* Find the first chunk that is not greater than `victim` */
                      while ((unsigned long) size < chunksize_nomask (fwd))
                        {
                          fwd = fwd->fd_nextsize;
			  assert (chunk_main_arena (fwd));
                        }

                      if ((unsigned long) size
			  == (unsigned long) chunksize_nomask (fwd))
                        /* If the size is the same, insert it after `fwd`, without adding nextsize to reduce computation */
                        /* Always insert in the second position.  */
                        fwd = fwd->fd;
                      else
                        {
                          /* Insert it before `fwd`, adding nextsize */
                          victim->fd_nextsize = fwd;
                          victim->bk_nextsize = fwd->bk_nextsize;
                          if (__glibc_unlikely (fwd->bk_nextsize->fd_nextsize != fwd))
                            malloc_printerr ("malloc(): largebin double linked list corrupted (nextsize)");
                          fwd->bk_nextsize = victim;
                          victim->bk_nextsize->fd_nextsize = victim;
                        }
                      bck = fwd->bk;
                      if (bck->fd != fwd)
                        malloc_printerr ("malloc(): largebin double linked list corrupted (bk)");
                    }
                }
              else // If large bin is empty
                victim->fd_nextsize = victim->bk_nextsize = victim;
            }

          // Insert into the linked list
          mark_bin (av, victim_index);
          victim->bk = bck;
          victim->fd = fwd;
          fwd->bk = victim;
          bck->fd = victim;

#if USE_TCACHE
      /* If we've processed as many chunks as we're allowed while
	 filling the cache, return one of the cached ones.  */
      // If tcache is full, get chunk from tcache
      ++tcache_unsorted_count;
      if (return_cached
	  && mp_.tcache_unsorted_limit > 0
	  && tcache_unsorted_count > mp_.tcache_unsorted_limit)
	{
	  return tcache_get (tc_idx);
	}
#endif

#define MAX_ITERS       10000
          if (++iters >= MAX_ITERS)
            break;
        }

#if USE_TCACHE
      /* If all the small chunks we found ended up cached, return one now.  */
      // After the while loop, get chunk from tcache
      if (return_cached)
	{
	  return tcache_get (tc_idx);
	}
#endif
```

If no chunks of the right size are found during the `sorted chunk` process, then find an appropriate chunk in the subsequent code

````c
       /*
         If a large request, scan through the chunks of current bin in
         sorted order to find smallest that fits.  Use the skip list for this.
       */

      if (!in_smallbin_range (nb))
        {
          bin = bin_at (av, idx);

          /* skip scan if empty or largest chunk is too small */
          // If large bin is non-empty and the size of the first chunk >= nb
          if ((victim = first (bin)) != bin
	      && (unsigned long) chunksize_nomask (victim)
	        >= (unsigned long) (nb))
            {
              // Find the first chunk with size >= nb
              victim = victim->bk_nextsize;
              while (((unsigned long) (size = chunksize (victim)) <
                      (unsigned long) (nb)))
                victim = victim->bk_nextsize;

              /* Avoid removing the first entry for a size so that the skip
                 list does not have to be rerouted.  */
              // If `victim` is not the last one and `victim->fd` has the same size as `victim`, return next one since it is not mainained by nextsize
              if (victim != last (bin)
		  && chunksize_nomask (victim)
		    == chunksize_nomask (victim->fd))
                victim = victim->fd;

              remainder_size = size - nb;
              unlink_chunk (av, victim); // Retrieve victim

              /* Exhaust */
              // If remaining is less than the minimum chunk, discard it
              if (remainder_size < MINSIZE)
                {
                  set_inuse_bit_at_offset (victim, size);
                  if (av != &main_arena)
		    set_non_main_arena (victim);
                }
              /* Split */
              // Otherwise, split it into the unsorted_bin
              else
                {
                  remainder = chunk_at_offset (victim, nb);
                  /* We cannot assume the unsorted list is empty and therefore
                     have to perform a complete insert here.  */
                  bck = unsorted_chunks (av);
                  fwd = bck->fd;
		  if (__glibc_unlikely (fwd->bk != bck))
		    malloc_printerr ("malloc(): corrupted unsorted chunks");
                  remainder->bk = bck;
                  remainder->fd = fwd;
                  bck->fd = remainder;
                  fwd->bk = remainder;
                  if (!in_smallbin_range (remainder_size))
                    {
                      remainder->fd_nextsize = NULL;
                      remainder->bk_nextsize = NULL;
                    }
                  set_head (victim, nb | PREV_INUSE |
                            (av != &main_arena ? NON_MAIN_ARENA : 0));
                  set_head (remainder, remainder_size | PREV_INUSE);
                  set_foot (remainder, remainder_size);
                }
              check_malloced_chunk (av, victim, nb);
              void *p = chunk2mem (victim);
              alloc_perturb (p, bytes);
              return p;
            }
        }

      /*
         Search for a chunk by scanning bins, starting with next largest
         bin. This search is strictly by best-fit; i.e., the smallest
         (with ties going to approximately the least recently used) chunk
         that fits is selected.

         The bitmap avoids needing to check that most blocks are nonempty.
         The particular case of skipping all bins during warm-up phases
         when no chunks have been returned yet is faster than it might look.
       */
	  /* This part is a bit confusing */思察。t is set to 1, others are set to 0

```c
for (;; )
{
    /* Skip rest of block if there are no more set bits in this block.  */
    /* If bit > map, it means that the free chunks in this block's bin are all smaller than the required chunk. Skip the loop directly. */
    if (bit > map || bit == 0)
    {
        do
        {
            // If there are no available blocks, then use the top chunk directly
            if (++block >= BINMAPSIZE) /* out of bins */
                goto use_top;
        }
        while ((map = av->binmap[block]) == 0);　// This block has no free chunks

        // Find the first bin of the current block
        bin = bin_at(av, (block << BINMAPSHIFT));
        bit = 1;
    }

    /* Advance to bin with set bit. There must be one. */
    // When the current bin is not available, search for the next bin
    while ((bit & map) == 0)
    {
        bin = next_bin(bin);
        bit <<= 1; // Use the next chunk
        assert(bit != 0);
    }

    /* Inspect the bin. It is likely to be non-empty */
    // Start from the smallest chunk
    victim = last(bin);

    /* If a false alarm (empty bin), clear the bit. */
    // If the bin is empty, update the value of binmap and find the next bin
    if (victim == bin)
    {
        av->binmap[block] = map &= ~bit; /* Write through */
        bin = next_bin(bin);
        bit <<= 1;
    }

    else
    {
        // If not empty, extract the chunk and perform splitting and merging
        size = chunksize(victim);

        /* We know the first chunk in this bin is big enough to use. */
        // The first chunk (the largest one) is large enough
        assert((unsigned long)(size) >= (unsigned long)(nb));

        remainder_size = size - nb;

        /* Unlink */
        unlink_chunk(av, victim);

        /* Exhaust */
        if (remainder_size < MINSIZE)
        {
            set_inuse_bit_at_offset(victim, size);
            if (av != &main_arena)
                set_non_main_arena(victim);
        }

        /* Split */
        else
        {
            remainder = chunk_at_offset(victim, nb);

            /* We cannot assume the unsorted list is empty and therefore have to perform a complete insert here. */
            bck = unsorted_chunks(av);
            fwd = bck->fd;
            if (__glibc_unlikely(fwd->bk != bck))
                malloc_printerr("malloc(): corrupted unsorted chunks 2");
            remainder->bk = bck;
            remainder->fd = fwd;
            bck->fd = remainder;
            fwd->bk = remainder;

            /* advertise as last remainder */
            if (in_smallbin_range(nb))
                av->last_remainder = remainder;
            if (!in_smallbin_range(remainder_size))
            {
                remainder->fd_nextsize = NULL;
                remainder->bk_nextsize = NULL;
            }
            set_head(victim, nb | PREV_INUSE | (av != &main_arena ? NON_MAIN_ARENA : 0));
            set_head(remainder, remainder_size | PREV_INUSE);
            set_foot(remainder, remainder_size);
        }
        check_malloced_chunk(av, victim, nb);
        void *p = chunk2mem(victim);
        alloc_perturb(p, bytes);
        return p;
    }
}
````

```c
use_top:
/*
    If large enough, split off the chunk bordering the end of memory
    (held in av->top). Note that this is in accord with the best-fit
    search rule. In effect, av->top is treated as larger (and thus
    less well fitting) than any other available chunk since it can
    be extended to be as large as necessary (up to system
    limitations).

    We require that av->top always exists (i.e., has size >=
    MINSIZE) after initialization, so if it would otherwise be
    exhausted by the current request, it is replenished. (The main
    reason for ensuring it exists is that we may need MINSIZE space
    to put in fenceposts in sysmalloc.)
*/

victim = av->top;
size = chunksize(victim);

if (__glibc_unlikely(size > av->system_mem))
    malloc_printerr("malloc(): corrupted top size");
// If the top chunk can be independent after splitting nb
if ((unsigned long)(size) >= (unsigned long)(nb + MINSIZE))
{
    remainder_size = size - nb;
    remainder = chunk_at_offset(victim, nb);
    av->top = remainder;
    set_head(victim, nb | PREV_INUSE | (av != &main_arena ? NON_MAIN_ARENA : 0));
    set_head(remainder, remainder_size | PREV_INUSE);

    check_malloced_chunk(av, victim, nb);
    void *p = chunk2mem(victim);
    alloc_perturb(p, bytes);
    return p;
}

/* When we are using atomic ops to free fast chunks we can get
    here for all block sizes. */
// If it is not enough to split and there are still fastbins, merge the fastbins
else if (atomic_load_relaxed(&av->have_fastchunks))
{
    malloc_consolidate(av);
    /* Restore the original bin index */
    if (in_smallbin_range(nb))
        idx = smallbin_index(nb);
    else
        idx = largebin_index(nb);
}

/*
    Otherwise, relay to handle system-dependent cases
*/
// Otherwise, call sysmalloc to request memory from the operating system
else
{
    void *p = sysmalloc(nb, av);
    if (p != NULL)
        alloc_perturb(p, bytes);
    return p;
}
}
```

:::info
This Content is generated by LLM and might be wrong / incomplete, refer to Chinese version if you find something wrong.
:::

{/* AI */}
