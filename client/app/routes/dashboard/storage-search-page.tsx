import { StorageSearch } from "@/storage/pages/search/search";

const StorageSearchPage = () => {
  return (
    <main className="flex flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold md:text-2xl">Search storage</h1>
      <StorageSearch />
    </main>
  );
};

export default StorageSearchPage;
