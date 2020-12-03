export const environment = {
    baseUrl: "https://evening-gorge-46233.herokuapp.com",
    port: 3000,
    discovery: {
        apiKey: "zETMdVzuCvBLUxX8dBubIlrx4uXMqAoWjERpCRmZGFoX",
        url:
            "https://api.us-south.discovery.watson.cloud.ibm.com/instances/7f0f7641-fd6d-4446-b737-02298ae80c19",
        environmentId: "f9fc1c49-87f1-4e29-8c5f-8c1484a0635c",
        version: "2019-4-30",
        collectionIds: new Map<string, string>([
            ["biden", "1c273339-0ed2-4d0f-84fd-fbe653c060f2"],
            ["trump", "35a6e950-6ab1-4697-8c36-7ffafdb0df35"],
        ]),
    },
};
